from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.database import get_session
from app.routers.auth import router as auth_router
from app.routers.charts import router as charts_router
from app.routers.dashboard import router as dashboard_router
from app.routers.observations import router as observations_router
from app.services.auth_service import AuthService


def seed_admin_user() -> None:
    for session in get_session():
        AuthService(session).seed_admin_user()
        break


@asynccontextmanager
async def lifespan(app: FastAPI):
    seed_admin_user()
    yield


app = FastAPI(title="Simonizer API", lifespan=lifespan)
app.include_router(auth_router)
app.include_router(observations_router)
app.include_router(dashboard_router)
app.include_router(charts_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
