from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.database import get_session
from app.routers.auth import router as auth_router
from app.services.auth_service import AuthService


@asynccontextmanager
async def lifespan(app: FastAPI):
    for session in get_session():
        AuthService(session).seed_admin_user()
        break
    yield


app = FastAPI(title="Simonizer API", lifespan=lifespan)
app.include_router(auth_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
