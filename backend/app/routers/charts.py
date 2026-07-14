from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session

from app.database import get_session
from app.models.observation import ObservationType
from app.models.user import User
from app.routers.auth import current_user
from app.schemas.charts import BloodPressureChartPoint, ChartPoint
from app.services.chart_service import ChartRangeError, ChartService

router = APIRouter(prefix="/api/charts", tags=["charts"])
DaysQuery = Annotated[str, Query(pattern="^(7|30|90|all)$")]


def _chart_service(session: Session) -> ChartService:
    return ChartService(session)


def _range_error(exc: ChartRangeError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=str(exc),
    )


@router.get("/weight", response_model=list[ChartPoint])
async def get_weight_chart(
    user: Annotated[User, Depends(current_user)],
    session: Annotated[Session, Depends(get_session)],
    days: DaysQuery = "30",
) -> list[ChartPoint]:
    try:
        return _chart_service(session).metric_points(
            user.id, ObservationType.WEIGHT, days
        )
    except ChartRangeError as exc:
        raise _range_error(exc) from exc


@router.get("/pulse", response_model=list[ChartPoint])
async def get_pulse_chart(
    user: Annotated[User, Depends(current_user)],
    session: Annotated[Session, Depends(get_session)],
    days: DaysQuery = "30",
) -> list[ChartPoint]:
    try:
        return _chart_service(session).metric_points(
            user.id, ObservationType.PULSE, days
        )
    except ChartRangeError as exc:
        raise _range_error(exc) from exc


@router.get("/bp", response_model=list[BloodPressureChartPoint])
async def get_bp_chart(
    user: Annotated[User, Depends(current_user)],
    session: Annotated[Session, Depends(get_session)],
    days: DaysQuery = "30",
) -> list[BloodPressureChartPoint]:
    try:
        return _chart_service(session).bp_points(user.id, days)
    except ChartRangeError as exc:
        raise _range_error(exc) from exc


@router.get("/walk", response_model=list[ChartPoint])
async def get_walk_chart(
    user: Annotated[User, Depends(current_user)],
    session: Annotated[Session, Depends(get_session)],
    days: DaysQuery = "30",
) -> list[ChartPoint]:
    try:
        return _chart_service(session).metric_points(
            user.id, ObservationType.WALK_DISTANCE, days
        )
    except ChartRangeError as exc:
        raise _range_error(exc) from exc


@router.get("/songs", response_model=list[ChartPoint])
async def get_songs_chart(
    user: Annotated[User, Depends(current_user)],
    session: Annotated[Session, Depends(get_session)],
    days: DaysQuery = "30",
) -> list[ChartPoint]:
    try:
        return _chart_service(session).metric_points(
            user.id, ObservationType.SONGS, days
        )
    except ChartRangeError as exc:
        raise _range_error(exc) from exc


@router.get("/nyha", response_model=list[ChartPoint])
async def get_nyha_chart(
    user: Annotated[User, Depends(current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> list[ChartPoint]:
    return _chart_service(session).nyha_points(user.id)
