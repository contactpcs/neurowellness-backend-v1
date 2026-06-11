"""
EEG Analysis router — accepts .nedf/.edf files, runs the full pipeline in a
background thread, then saves generated PDFs directly to TimescaleDB via the
EEGReportService (no HTTP round-trip needed).
"""

import asyncio
import os
import shutil
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Dict, Optional

import structlog
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

logger = structlog.get_logger()

RESULTS_DIR = Path("results/eeg_analysis")
_executor = ThreadPoolExecutor(max_workers=2)
jobs: Dict[str, Dict[str, Any]] = {}

router = APIRouter()

# ── Lazy import of analysis_script ────────────────────────────────────────────
_ers = None


def _get_ers():
    global _ers
    if _ers is None:
        from app.eeg_analysis import analysis_script
        _ers = analysis_script
    return _ers


# ── DB upload helper (runs inside worker thread via asyncio.run) ───────────────

def _to_async_url(url: str) -> str:
    from urllib.parse import urlparse, urlencode, parse_qs, urlunparse
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            url = "postgresql+asyncpg://" + url[len(prefix):]
            break
    if "sslmode" in url:
        parsed = urlparse(url)
        params = {k: v[0] for k, v in parse_qs(parsed.query).items() if k != "sslmode"}
        url = urlunparse(parsed._replace(query=urlencode(params)))
    return url


async def _upload_pdf_to_db(
    pdf_path: Path,
    patient_id: str,
    session_id: Optional[str],
    report_name: str,
    report_type: str,
) -> Optional[str]:
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
    from app.config import get_settings
    from app.services.eeg_report_service import EEGReportService

    settings = get_settings()
    url = _to_async_url(settings.TSDB_DATABASE_URL)
    engine = create_async_engine(url, connect_args={"ssl": "require"}, pool_size=1, max_overflow=0)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        async with factory() as session:
            svc = EEGReportService(session)
            return await svc.upload_pdf_from_path(pdf_path, patient_id, session_id, report_name, report_type)
    except Exception as exc:
        logger.error("eeg_analysis_db_upload_failed", pdf=str(pdf_path), error=str(exc))
        return None
    finally:
        await engine.dispose()


# ── Route helpers ─────────────────────────────────────────────────────────────

def _step(job_id: str, msg: str) -> None:
    jobs[job_id]["step"] = msg


def _warn(job_id: str, msg: str) -> None:
    jobs[job_id]["warnings"].append(msg)


def _infer_report_type(filename: str) -> str:
    name = filename.lower()
    if "connectivity" in name:
        return "BRAIN_CONNECTIVITY"
    if "indicator" in name:
        return "BRAIN_INDICATORS"
    return "EEG_ANALYSIS"


# ── Background analysis worker ─────────────────────────────────────────────────

def _run_analysis(
    job_id: str,
    nedf_path: Path,
    job_dir: Path,
    patient_id: str,
    session_id: Optional[str],
    report_name: str,
) -> None:
    jobs[job_id]["status"] = "running"
    try:
        import mne
        ers = _get_ers()
        ers._init_resources()

        base_name = nedf_path.stem
        target_dir = str(job_dir)
        icons_path = str(ers.ICONS_DIR)

        # 1. Load EEG file
        _step(job_id, "Loading EEG data")
        ext = nedf_path.suffix.lower()
        if ext == ".nedf":
            raw = mne.io.read_raw_nedf(str(nedf_path), preload=True)
        elif ext == ".edf":
            raw = mne.io.read_raw_edf(str(nedf_path), preload=True)
            rename_map = {ch: ch.replace("-REF", "") for ch in raw.ch_names if "-REF" in ch}
            if rename_map:
                raw.rename_channels(rename_map)
            non_eeg = {
                ch: "misc"
                for ch in raw.ch_names
                if ch in ("LOC-A2", "ROC-A1", "LOC", "ROC", "A1", "A2") or "EMG" in ch.upper()
            }
            if non_eeg:
                raw.set_channel_types(non_eeg)
        else:
            raise ValueError(f"Unsupported format: {ext}")
        raw.set_montage("standard_1020", on_missing="ignore")

        # 2. Raw/filtered EEG plots
        _step(job_id, "Generating raw / filtered EEG plots")
        os.makedirs(f"{target_dir}/plots", exist_ok=True)
        raw_clean = ers.save_raw_and_cleaned_data(raw, target_dir)

        # 3. ICA
        _step(job_id, "Computing ICA components (10-20 min)")
        ers.dipoles.clear()
        ers.save_ica_components(raw_clean, ers.dipoles, target_dir)

        # 4. Band topomaps
        _step(job_id, "Generating band topomaps")
        ers.band_topomaps(raw_clean, target_dir=target_dir, bands=ers.EEG_Bands)

        # 5. DOCX report
        _step(job_id, "Building Word report")
        metadata = ers.make_doc(base_name, raw, target_dir, ers.OUTPUT_DOCX, icons_path)

        # 6. PDF conversion
        _step(job_id, "Converting DOCX → PDF")
        try:
            ers.doc_to_pdf(ers.OUTPUT_DOCX, ers.OUTPUT_PDF, target_dir)
        except Exception as e:
            _warn(job_id, f"PDF conversion failed: {e}")

        # 7. Brain indicators
        _step(job_id, "Generating brain indicator report")
        try:
            ers.plot_indicators(raw, base_name, target_dir)
        except Exception as e:
            _warn(job_id, f"Brain indicators failed: {e}")

        # 8. Brain connectivity
        _step(job_id, "Computing brain connectivity report")
        try:
            ers.brain_connectivity(
                raw, metadata, ers.normative_stats, target_dir,
                ers.OUTPUT_BRAIN_CONNECTIVITY, ers.brain_image,
            )
        except Exception as e:
            _warn(job_id, f"Brain connectivity failed: {e}")

        # 9. Collect generated PDFs
        pdf_files = [f for f in sorted(job_dir.rglob("*")) if f.suffix == ".pdf"]
        outputs = [f.relative_to(job_dir).as_posix() for f in pdf_files]

        # 10. Save PDFs to TimescaleDB directly
        _step(job_id, "Saving reports to database")
        uploaded_ids = []
        for pdf in pdf_files:
            rtype = _infer_report_type(pdf.name)
            try:
                rid = asyncio.run(
                    _upload_pdf_to_db(pdf, patient_id, session_id, report_name, rtype)
                )
                if rid:
                    uploaded_ids.append(rid)
                else:
                    _warn(job_id, f"DB upload returned None for {pdf.name}")
            except Exception as exc:
                _warn(job_id, f"DB upload failed for {pdf.name}: {exc}")

        jobs[job_id].update(
            {
                "status": "done",
                "step": "Complete",
                "outputs": outputs,
                "uploaded_report_ids": uploaded_ids,
            }
        )

    except Exception as e:
        jobs[job_id].update(
            {
                "status": "failed",
                "step": "Failed",
                "error": f"{e}\n{traceback.format_exc()}",
            }
        )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/analyze", status_code=202)
async def analyze(
    file: UploadFile = File(...),
    patient_id: str = Form(...),
    session_id: Optional[str] = Form(None),
    report_name: Optional[str] = Form(None),
):
    """Accept a .nedf or .edf file and start async EEG analysis."""
    if not file.filename.lower().endswith((".nedf", ".edf")):
        raise HTTPException(status_code=400, detail="Only .nedf or .edf files accepted")

    job_id = str(uuid.uuid4())
    job_dir = RESULTS_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    content = await file.read()
    nedf_path = job_dir / file.filename
    nedf_path.write_bytes(content)

    derived_name = report_name or nedf_path.stem

    jobs[job_id] = {
        "status": "queued",
        "step": "Queued — waiting for worker",
        "file": file.filename,
        "patient_id": patient_id,
        "session_id": session_id,
        "report_name": derived_name,
        "outputs": [],
        "uploaded_report_ids": [],
        "warnings": [],
        "error": None,
    }

    _executor.submit(_run_analysis, job_id, nedf_path, job_dir, patient_id, session_id, derived_name)
    return {"job_id": job_id}


@router.get("/status/{job_id}")
async def get_status(job_id: str):
    """Return the current status of an analysis job."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return jobs[job_id]


@router.get("/download/{job_id}/{filename:path}")
async def download_file(job_id: str, filename: str):
    """Download a generated file from an analysis job."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    job_dir = (RESULTS_DIR / job_id).resolve()
    file_path = (job_dir / filename).resolve()
    if not str(file_path).startswith(str(job_dir)):
        raise HTTPException(status_code=403, detail="Access denied")
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(str(file_path), filename=Path(filename).name)
