from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.database import get_session
from app.models.target import TargetType
from app.models.user import User
from app.routers.auth import current_user
from app.schemas.targets import TargetsResponse, TargetUpdateRequest
from app.services.target_service import TargetService, TargetValidationError

router = APIRouter(prefix="/api/targets", tags=["targets"])


@router.get("", response_model=TargetsResponse)
async def get_targets(
    user: Annotated[User, Depends(current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> TargetsResponse:
    return TargetService(session).get_view(user_id=user.id)


@router.put("/{target_type}", response_model=TargetsResponse)
async def update_target(
    target_type: TargetType,
    payload: TargetUpdateRequest,
    user: Annotated[User, Depends(current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> TargetsResponse:
    try:
        return TargetService(session).update(
            user_id=user.id,
            target_type=target_type,
            value=payload.value,
        )
    except TargetValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
