from datetime import UTC, date, datetime, timedelta

from app.models.observation import Observation, ObservationType
from app.models.user import User
from app.services.achievement_service import AchievementService
from app.services.observation_service import ObservationService
from sqlmodel import Session, SQLModel, create_engine
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


def milestone_by_type(milestones, milestone_type: str):
    return next(
        milestone for milestone in milestones if milestone.type == milestone_type
    )


def test_achievement_service_calculates_best_value_and_first_time_milestones():
    with make_session() as session:
        user = make_user(session)
        service = ObservationService(session)
        service.upsert(user, date(2026, 7, 10), ObservationType.WALK_DISTANCE, "325")
        service.upsert(user, date(2026, 7, 11), ObservationType.WALK_DISTANCE, "400")
        service.upsert(user, date(2026, 7, 12), ObservationType.WALK_DISTANCE, "400")
        service.upsert(user, date(2026, 7, 10), ObservationType.SONGS, "2")
        service.upsert(user, date(2026, 7, 11), ObservationType.SONGS, "4")
        service.upsert(user, date(2026, 7, 10), ObservationType.PULSE, "72")
        service.upsert(user, date(2026, 7, 11), ObservationType.PULSE, "68")
        service.upsert(user, date(2026, 7, 10), ObservationType.NYHA, "3")
        service.upsert(user, date(2026, 7, 12), ObservationType.NYHA, "2")
        service.upsert(user, date(2026, 7, 13), ObservationType.SYMPTOMS, ["good_day"])

        milestones = AchievementService(session).list(user_id=user.id)

        assert milestone_by_type(milestones, "longest_walk") == {
            "type": "longest_walk",
            "title": "Longest walk",
            "date": "2026-07-11",
            "message": "You walked 400 metres - your furthest yet.",
            "value": "400 m",
        }
        assert milestone_by_type(milestones, "most_songs").value == "4 songs"
        assert milestone_by_type(milestones, "lowest_resting_pulse").value == "68 bpm"
        assert milestone_by_type(milestones, "first_nyha_iii").date == "2026-07-10"
        assert milestone_by_type(milestones, "first_nyha_ii").date == "2026-07-12"
        assert (
            milestone_by_type(milestones, "first_symptom_free_day").date == "2026-07-13"
        )


def test_achievement_service_calculates_weight_stability_and_recording_milestones():
    with make_session() as session:
        user = make_user(session)
        start = date(2026, 6, 1)
        for index in range(30):
            day = start + timedelta(days=index)
            session.add(
                Observation(
                    user_id=user.id,
                    date=day,
                    type=ObservationType.NOTES,
                    value=f"Day {index}",
                    created_at=datetime(2026, 6, 1, 9, index, tzinfo=UTC),
                    updated_at=datetime(2026, 6, 1, 9, index, tzinfo=UTC),
                )
            )
        for index in range(70):
            session.add(
                Observation(
                    user_id=user.id,
                    date=date(2026, 7, 1) + timedelta(days=index),
                    type=ObservationType.PULSE,
                    value=str(70 + index),
                    created_at=datetime(2026, 7, 1, 9, tzinfo=UTC)
                    + timedelta(minutes=index),
                    updated_at=datetime(2026, 7, 1, 9, tzinfo=UTC)
                    + timedelta(minutes=index),
                )
            )
        session.add(
            Observation(
                user_id=user.id,
                date=date(2026, 7, 1),
                type=ObservationType.WEIGHT,
                value="92.0",
            )
        )
        session.add(
            Observation(
                user_id=user.id,
                date=date(2026, 7, 7),
                type=ObservationType.WEIGHT,
                value="92.8",
            )
        )
        session.add(
            Observation(
                user_id=user.id,
                date=date(2026, 7, 30),
                type=ObservationType.WEIGHT,
                value="92.7",
            )
        )
        session.commit()

        milestones = AchievementService(session).list(user_id=user.id)

        assert (
            milestone_by_type(milestones, "weight_stable_7_days").date == "2026-07-07"
        )
        assert (
            milestone_by_type(milestones, "weight_stable_30_days").date == "2026-07-30"
        )
        assert (
            milestone_by_type(milestones, "one_hundred_observations").date
            == "2026-09-08"
        )
        assert (
            milestone_by_type(milestones, "thirty_consecutive_days").date
            == "2026-06-30"
        )


def test_achievement_service_is_user_scoped_and_skips_invalid_values():
    with make_session() as session:
        simon = make_user(session, "simon")
        vicky = make_user(session, "vicky")
        session.add(
            Observation(
                user_id=simon.id,
                date=date(2026, 7, 10),
                type=ObservationType.WALK_DISTANCE,
                value="oops",
            )
        )
        session.add(
            Observation(
                user_id=vicky.id,
                date=date(2026, 7, 10),
                type=ObservationType.WALK_DISTANCE,
                value="999",
            )
        )
        session.commit()

        milestones = AchievementService(session).list(user_id=simon.id)

        assert [milestone.type for milestone in milestones] == []
