from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from app.config import get_settings
from app.limiter import limiter
from app.routers import auth, doctors, patients, notifications, staff, users
from app.routers.prs import scales, conditions, permissions, assessment, scores, questions
from app.routers.anamnesis import assessment as anamnesis_assessment

settings = get_settings()

app = FastAPI(
    title="NeuroWellness API",
    version="1.0.0",
    docs_url="/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url="/redoc" if settings.ENVIRONMENT != "production" else None,
)

# Attach limiter to app state so @limiter.limit() decorators can find it
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS must be added BEFORE SlowAPIMiddleware so it wraps all responses
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    max_age=600,
)
app.add_middleware(SlowAPIMiddleware)

PREFIX = settings.API_PREFIX

app.include_router(auth.router,          prefix=f"{PREFIX}/auth",            tags=["auth"])
app.include_router(users.router,         prefix=f"{PREFIX}/users",           tags=["users"])
app.include_router(doctors.router,       prefix=f"{PREFIX}/doctors",         tags=["doctors"])
app.include_router(patients.router,      prefix=f"{PREFIX}/patients",        tags=["patients"])
app.include_router(notifications.router, prefix=f"{PREFIX}/notifications",   tags=["notifications"])
app.include_router(staff.router,         prefix=f"{PREFIX}/staff",           tags=["staff"])
app.include_router(anamnesis_assessment.router, prefix=f"{PREFIX}/anamnesis",   tags=["anamnesis"])
app.include_router(scales.router,        prefix=f"{PREFIX}/prs/scales",      tags=["prs-scales"])
app.include_router(conditions.router,    prefix=f"{PREFIX}/prs/conditions",  tags=["prs-conditions"])
app.include_router(permissions.router,   prefix=f"{PREFIX}/prs/permissions", tags=["prs-permissions"])
app.include_router(assessment.router,    prefix=f"{PREFIX}/prs/assessment",  tags=["prs-assessment"])
app.include_router(scores.router,        prefix=f"{PREFIX}/prs/scores",      tags=["prs-scores"])
app.include_router(questions.router,     prefix=f"{PREFIX}/prs/questions",   tags=["prs-questions"])


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0", "environment": settings.ENVIRONMENT}
