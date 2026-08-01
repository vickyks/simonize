from typing import Annotated

from fastapi import APIRouter, Depends
from sqlmodel import Session

from app.database import get_session
from app.models.user import User
from app.routers.auth import current_user
from app.schemas.imports import (
    ImportApplyRequest,
    ImportApplyResponse,
    ImportPreviewRequest,
    ImportPreviewResponse,
)
from app.services.observation_import_service import ObservationImportService

router = APIRouter(prefix="/api/import/observations", tags=["import"])


@router.post("/preview", response_model=ImportPreviewResponse)
async def preview_import(
    request: ImportPreviewRequest,
    user: Annotated[User, Depends(current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> ImportPreviewResponse:
    return ObservationImportService(session).preview(user=user, text=request.text)


@router.post("/apply", response_model=ImportApplyResponse)
async def apply_import(
    request: ImportApplyRequest,
    user: Annotated[User, Depends(current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> ImportApplyResponse:
    return ObservationImportService(session).apply(user=user, items=request.items)
