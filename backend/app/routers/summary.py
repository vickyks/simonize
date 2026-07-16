from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.database import get_session
from app.models.user import User
from app.routers.auth import current_user
from app.schemas.summary import SummaryResponse
from app.services.summary_service import SummaryRangeError, SummaryService

router = APIRouter(prefix="/api/summary", tags=["summary"])
DaysQuery = Annotated[str, Query(pattern="^(7|30)$")]


@router.get("", response_model=SummaryResponse)
async def get_summary(
    user: Annotated[User, Depends(current_user)],
    session: Annotated[Session, Depends(get_session)],
    days: DaysQuery = "7",
) -> SummaryResponse:
    try:
        return SummaryService(session).build(user_id=user.id, days=days)
    except SummaryRangeError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
