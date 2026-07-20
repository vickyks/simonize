from datetime import date

import pytest
from app.models.observation import ObservationType
from app.models.target import Target, TargetType
from app.models.user import User
from app.services.observation_service import ObservationService
from app.services.target_service import TargetService, TargetValidationError
from sqlmodel import Session, SQLModel, create_engine, select
from sqlmodel.pool import StaticPool


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


def test_target_service_creates_defaults_in_stable_order():
    with make_session() as session:
        user = make_user(session)

        response = TargetService(session).get_view(user_id=user.id)

        assert [target.type for target in response.targets] == [
            TargetType.WALK_DISTANCE,
            TargetType.SONGS,
            TargetType.NYHA,
        ]
        assert [target.value for target in response.targets] == [500, 5, 2]
        assert [target.unit for target in response.targets] == ["m", "songs", "class"]
        assert response.milestones == []


def test_target_service_returns_target_entries_without_milestones():
    with make_session() as session:
        user = make_user(session)
        ObservationService(session).upsert(
            user, date(2026, 7, 13), ObservationType.WALK_DISTANCE, "325"
        )

        targets = TargetService(session).get_targets(user_id=user.id)

        assert [target.type for target in targets] == [
            TargetType.WALK_DISTANCE,
            TargetType.SONGS,
            TargetType.NYHA,
        ]
        assert [target.value for target in targets] == [500, 5, 2]


def test_target_view_includes_achievements():
    with make_session() as session:
        user = make_user(session)

        ObservationService(session).upsert(
            user, date(2026, 7, 13), ObservationType.WALK_DISTANCE, "325"
        )

        response = TargetService(session).get_view(user_id=user.id)

        assert response.milestones[0].type == "longest_walk"


def test_target_update_persists_value_for_current_user_only():
    with make_session() as session:
        simon = make_user(session, "simon")
        vicky = make_user(session, "vicky")
        service = TargetService(session)

        service.update(
            user_id=simon.id,
            target_type=TargetType.WALK_DISTANCE,
            value="650",
        )
        service.get_view(user_id=vicky.id)

        simon_target = session.exec(
            select(Target)
            .where(Target.user_id == simon.id)
            .where(Target.type == TargetType.WALK_DISTANCE)
        ).one()
        vicky_target = session.exec(
            select(Target)
            .where(Target.user_id == vicky.id)
            .where(Target.type == TargetType.WALK_DISTANCE)
        ).one()

        assert simon_target.value == "650"
        assert vicky_target.value == "500"


@pytest.mark.parametrize(
    ("target_type", "value"),
    [
        (TargetType.WALK_DISTANCE, "-1"),
        (TargetType.WALK_DISTANCE, "50001"),
        (TargetType.WALK_DISTANCE, "12.5"),
        (TargetType.SONGS, "-1"),
        (TargetType.SONGS, "101"),
        (TargetType.NYHA, "0"),
        (TargetType.NYHA, "5"),
        (TargetType.NYHA, "two"),
    ],
)
def test_target_update_rejects_invalid_values(target_type: TargetType, value: str):
    with make_session() as session:
        user = make_user(session)

        with pytest.raises(TargetValidationError):
            TargetService(session).update(
                user_id=user.id,
                target_type=target_type,
                value=value,
            )
