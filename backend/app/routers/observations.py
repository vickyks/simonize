from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.database import get_session
from app.models.observation import ObservationType
from app.models.user import User
from app.routers.auth import current_user
from app.schemas.observations import (
    ChecklistItem,
    DailyObservationsResponse,
    ObservationResponse,
    ObservationUpsertRequest,
)
from app.services.observation_service import ObservationService, ValidationError

router = APIRouter(prefix="/api/observations", tags=["observations"])

CHECKLIST = [
    (ObservationType.WEIGHT, "Weight"),
    (ObservationType.PULSE, "Pulse"),
    (ObservationType.BP, "Blood Pressure"),
    (ObservationType.WALK_DISTANCE, "Walk"),
    (ObservationType.SONGS, "Guitar"),
    (ObservationType.NYHA, "NYHA"),
    (ObservationType.SYMPTOMS, "Symptoms"),
    (ObservationType.NOTES, "Notes"),
]


@router.get("/{day}", response_model=DailyObservationsResponse)
async def get_observations(
    day: date,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
) -> DailyObservationsResponse:
    service = ObservationService(session)
    observations = service.get_for_date(user, day)
    response_observations = {
        observation_type.value: ObservationResponse(**service.to_view(observation))
        for observation_type, observation in observations.items()
    }
    checklist = [
        ChecklistItem(
            type=observation_type.value,
            label=label,
            recorded=observation_type in observations,
        )
        for observation_type, label in CHECKLIST
    ]
    return DailyObservationsResponse(
        date=day.isoformat(),
        observations=response_observations,
        checklist=checklist,
    )


@router.put("/{day}/{observation_type}", response_model=ObservationResponse)
async def put_observation(
    day: date,
    observation_type: ObservationType,
    request: ObservationUpsertRequest,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
) -> ObservationResponse:
    service = ObservationService(session)
    try:
        observation = service.upsert(
            user=user,
            day=day,
            observation_type=observation_type,
            value=request.value,
            metadata=request.metadata,
        )
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    return ObservationResponse(**service.to_view(observation))
