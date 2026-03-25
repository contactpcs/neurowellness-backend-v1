from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.config import get_settings
from app.routers import auth, doctors, patients, notifications
from app.routers.prs import scales, conditions, permissions, assessment, scores

settings = get_settings()

app = FastAPI(
    title="NeuroWellness API",
    version="1.0.0",
    docs_url="/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url="/redoc" if settings.ENVIRONMENT != "production" else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    max_age=600,
)

PREFIX = settings.API_PREFIX

app.include_router(auth.router, prefix=f"{PREFIX}/auth", tags=["auth"])
app.include_router(doctors.router, prefix=f"{PREFIX}/doctors", tags=["doctors"])
app.include_router(patients.router, prefix=f"{PREFIX}/patients", tags=["patients"])
app.include_router(notifications.router, prefix=f"{PREFIX}/notifications", tags=["notifications"])
app.include_router(scales.router, prefix=f"{PREFIX}/prs/scales", tags=["prs-scales"])
app.include_router(conditions.router, prefix=f"{PREFIX}/prs/conditions", tags=["prs-conditions"])
app.include_router(permissions.router, prefix=f"{PREFIX}/prs/permissions", tags=["prs-permissions"])
app.include_router(assessment.router, prefix=f"{PREFIX}/prs/assessment", tags=["prs-assessment"])
app.include_router(scores.router, prefix=f"{PREFIX}/prs/scores", tags=["prs-scores"])


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0", "environment": settings.ENVIRONMENT}


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"success": False, "message": "Internal server error", "detail": str(exc)},
    )
