import hashlib
import uuid
from pathlib import Path
from typing import List, Optional, Tuple

import structlog
from fastapi import HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.eeg_report_orm import ReportStatus
from app.repositories.eeg_report_repository import EEGReportRepository
from app.schemas.eeg_report import EEGReportOut

logger = structlog.get_logger()

MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024  # 20 MB
ALLOWED_MIME_TYPES = {"application/pdf", "application/x-pdf"}
ALLOWED_EXTENSIONS = {".pdf"}
PDF_MAGIC = b"%PDF"


# ── Validation ────────────────────────────────────────────────────────────────

def _validate(file: UploadFile, content: bytes) -> None:
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid MIME type '{file.content_type}'. Only PDF allowed.",
        )
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Only .pdf files accepted.")
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File size {len(content):,} bytes exceeds 20 MB limit.",
        )
    if not content.startswith(PDF_MAGIC):
        raise HTTPException(status_code=400, detail="File is not a valid PDF (bad magic bytes).")


# ── File I/O ──────────────────────────────────────────────────────────────────

def _storage_path(patient_id: str, report_uuid: str) -> Path:
    settings = get_settings()
    dir_ = Path(settings.UPLOADS_DIR) / "eeg_reports" / patient_id
    dir_.mkdir(parents=True, exist_ok=True)
    return dir_ / f"{report_uuid}.pdf"


def _write_file(path: Path, content: bytes) -> None:
    path.write_bytes(content)
    logger.info("eeg_file_saved", path=str(path), size_bytes=len(content))


def _remove_file(path: str) -> None:
    try:
        p = Path(path)
        if p.exists():
            p.unlink()
            logger.info("eeg_file_removed", path=path)
    except Exception as exc:
        logger.warning("eeg_file_remove_failed", path=path, error=str(exc))


# ── Service ───────────────────────────────────────────────────────────────────

class EEGReportService:
    def __init__(self, session: AsyncSession):
        self._repo = EEGReportRepository(session)

    async def upload_report(
        self,
        file: UploadFile,
        patient_id: str,
        session_id: Optional[str],
        report_name: str,
        report_type: str = "EEG_ANALYSIS",
    ) -> EEGReportOut:
        content = await file.read()
        _validate(file, content)

        checksum = hashlib.sha256(content).hexdigest()

        existing = await self._repo.get_by_checksum(checksum, patient_id)
        if existing:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "Duplicate report: identical file already uploaded.",
                    "existing_report_id": str(existing.id),
                },
            )

        version = (await self._repo.get_latest_version(patient_id, report_name)) + 1
        report_uuid = str(uuid.uuid4())
        file_path = _storage_path(patient_id, report_uuid)

        try:
            _write_file(file_path, content)
        except Exception as exc:
            logger.error("eeg_file_save_error", error=str(exc))
            raise HTTPException(status_code=500, detail="Failed to persist report file.")

        try:
            report = await self._repo.create(
                {
                    "id": uuid.UUID(report_uuid),
                    "patient_id": patient_id,
                    "session_id": session_id,
                    "report_name": report_name,
                    "file_path": str(file_path),
                    "file_size_bytes": len(content),
                    "report_type": report_type,
                    "sha256_checksum": checksum,
                    "version": version,
                    "status": ReportStatus.COMPLETED,
                }
            )
        except Exception as exc:
            _remove_file(str(file_path))
            logger.error("eeg_db_insert_error", error=str(exc))
            raise HTTPException(status_code=500, detail="Failed to persist report metadata.")

        logger.info(
            "eeg_report_uploaded",
            report_id=str(report.id),
            patient_id=patient_id,
            size_bytes=len(content),
            version=version,
        )
        return EEGReportOut.model_validate(report)

    async def get_report(self, report_id: uuid.UUID) -> EEGReportOut:
        report = await self._repo.get_by_id(report_id)
        if not report:
            raise HTTPException(status_code=404, detail="EEG report not found.")
        return EEGReportOut.model_validate(report)

    async def get_report_file_path(self, report_id: uuid.UUID) -> Path:
        report = await self._repo.get_by_id(report_id)
        if not report:
            raise HTTPException(status_code=404, detail="EEG report not found.")
        p = Path(report.file_path)
        if not p.exists():
            raise HTTPException(status_code=404, detail="Report PDF missing from storage.")
        return p

    async def list_patient_reports(
        self, patient_id: str, skip: int = 0, limit: int = 20
    ) -> Tuple[List[EEGReportOut], int]:
        reports, total = await self._repo.list_by_patient(patient_id, skip, limit)
        return [EEGReportOut.model_validate(r) for r in reports], total

    async def upload_pdf_from_path(
        self,
        pdf_path: Path,
        patient_id: str,
        session_id: Optional[str],
        report_name: str,
        report_type: str = "EEG_ANALYSIS",
    ) -> Optional[str]:
        """Save a PDF from disk path directly to DB+storage. Returns report_id or None."""
        try:
            content = pdf_path.read_bytes()
        except Exception as exc:
            logger.error("eeg_pdf_read_error", path=str(pdf_path), error=str(exc))
            return None

        if not content.startswith(PDF_MAGIC):
            logger.warning("eeg_not_a_pdf", path=str(pdf_path))
            return None

        checksum = hashlib.sha256(content).hexdigest()
        existing = await self._repo.get_by_checksum(checksum, patient_id)
        if existing:
            return str(existing.id)

        version = (await self._repo.get_latest_version(patient_id, report_name)) + 1
        report_uuid = str(uuid.uuid4())
        dest_path = _storage_path(patient_id, report_uuid)

        try:
            dest_path.write_bytes(content)
        except Exception as exc:
            logger.error("eeg_file_copy_error", error=str(exc))
            return None

        try:
            report = await self._repo.create(
                {
                    "id": uuid.UUID(report_uuid),
                    "patient_id": patient_id,
                    "session_id": session_id,
                    "report_name": report_name,
                    "file_path": str(dest_path),
                    "file_size_bytes": len(content),
                    "report_type": report_type,
                    "sha256_checksum": checksum,
                    "version": version,
                    "status": ReportStatus.COMPLETED,
                }
            )
            logger.info("eeg_report_saved_from_analysis", report_id=str(report.id), patient_id=patient_id)
            return str(report.id)
        except Exception as exc:
            _remove_file(str(dest_path))
            logger.error("eeg_db_insert_error", error=str(exc))
            return None

    async def delete_report(self, report_id: uuid.UUID) -> None:
        report = await self._repo.get_by_id(report_id)
        if not report:
            raise HTTPException(status_code=404, detail="EEG report not found.")
        file_path = report.file_path
        await self._repo.soft_delete(report)
        _remove_file(file_path)
        logger.info("eeg_report_deleted", report_id=str(report_id))
