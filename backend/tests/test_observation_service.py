from datetime import date

import pytest
from sqlmodel import Session, SQLModel, create_engine, select
from sqlmodel.pool import StaticPool

from app.models.observation import Observation, ObservationType
from app.models.user import User
from app.services.observation_service import ObservationService, ValidationError


def make_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    return Session(engine)


def make_user(session: Session, username: str = "simon") -> User:
    user = User(username=username, hashed_password="hash")
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def test_upsert_creates_and_updates_without_duplicates():
    with make_session() as session:
        user = make_user(session)
        service = ObservationService(session)
        day = date(2026, 6, 27)

        created = service.upsert(user, day, ObservationType.WEIGHT, "92.3")
        updated = service.upsert(user, day, ObservationType.WEIGHT, "92.1")
        rows = session.exec(select(Observation)).all()

        assert updated.id == created.id
        assert updated.value == "92.1"
        assert len(rows) == 1


def test_get_for_date_is_scoped_to_user():
    with make_session() as session:
        simon = make_user(session, "simon")
        vicky = make_user(session, "vicky")
        service = ObservationService(session)
        day = date(2026, 6, 27)

        service.upsert(simon, day, ObservationType.PULSE, "70")
        service.upsert(vicky, day, ObservationType.PULSE, "88")

        simon_observations = service.get_for_date(simon, day)

        assert simon_observations[ObservationType.PULSE].value == "70"


@pytest.mark.parametrize(
    ("observation_type", "value", "stored"),
    [
        (ObservationType.WEIGHT, "92.3", "92.3"),
        (ObservationType.PULSE, "71", "71"),
        (ObservationType.BP, "121/78", "121/78"),
        (ObservationType.WALK_DISTANCE, "325", "325"),
        (ObservationType.WALK_TIME, "840", "840"),
        (ObservationType.WALK_STOPS, "2", "2"),
        (ObservationType.SONGS, "3", "3"),
        (ObservationType.NYHA, "3", "3"),
        (ObservationType.SYMPTOMS, ["good_day"], '["good_day"]'),
        (ObservationType.NOTES, "Felt stronger today", "Felt stronger today"),
    ],
)
def test_valid_values_are_stored(observation_type, value, stored):
    with make_session() as session:
        user = make_user(session)
        observation = ObservationService(session).upsert(
            user, date(2026, 6, 27), observation_type, value
        )

        assert observation.value == stored


@pytest.mark.parametrize(
    ("observation_type", "value"),
    [
        (ObservationType.WEIGHT, "20"),
        (ObservationType.PULSE, "251"),
        (ObservationType.BP, "78/121"),
        (ObservationType.WALK_DISTANCE, "50001"),
        (ObservationType.WALK_TIME, "86401"),
        (ObservationType.WALK_STOPS, "101"),
        (ObservationType.SONGS, "101"),
        (ObservationType.NYHA, "5"),
        (ObservationType.SYMPTOMS, ["good_day", "breathless"]),
        (ObservationType.SYMPTOMS, ["unknown"]),
        (ObservationType.NOTES, "x" * 2001),
    ],
)
def test_invalid_values_raise_validation_error(observation_type, value):
    with make_session() as session:
        user = make_user(session)

        with pytest.raises(ValidationError):
            ObservationService(session).upsert(
                user, date(2026, 6, 27), observation_type, value
            )


@pytest.mark.parametrize("value", ["nan", "inf", "-inf"])
def test_weight_rejects_non_finite_values(value):
    with make_session() as session:
        user = make_user(session)

        with pytest.raises(ValidationError):
            ObservationService(session).upsert(
                user, date(2026, 6, 27), ObservationType.WEIGHT, value
            )


@pytest.mark.parametrize(
    ("observation_type", "value"),
    [
        (ObservationType.WALK_STOPS, 1.9),
        (ObservationType.WALK_STOPS, True),
        (ObservationType.NYHA, 1.9),
        (ObservationType.NYHA, True),
    ],
)
def test_integer_values_reject_non_integral_numbers_and_booleans(observation_type, value):
    with make_session() as session:
        user = make_user(session)

        with pytest.raises(ValidationError):
            ObservationService(session).upsert(
                user, date(2026, 6, 27), observation_type, value
            )


def test_walk_distance_metadata_is_preserved():
    with make_session() as session:
        user = make_user(session)
        observation = ObservationService(session).upsert(
            user,
            date(2026, 6, 27),
            ObservationType.WALK_DISTANCE,
            "325",
            metadata={"time_seconds": 840, "stops": 2},
        )

        assert observation.extra_metadata == {"time_seconds": 840, "stops": 2}
