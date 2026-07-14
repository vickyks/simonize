from datetime import date

import pytest
from app.models.observation import Observation, ObservationType
from app.models.user import User
from app.services.chart_service import ChartRangeError, ChartService
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


def test_metric_points_filter_range_and_order_by_date():
    with make_session() as session:
        user = make_user(session)
        service = ObservationService(session)
        service.upsert(user, date(2026, 7, 1), ObservationType.WEIGHT, "91.0")
        service.upsert(user, date(2026, 7, 7), ObservationType.WEIGHT, "92.1")
        service.upsert(user, date(2026, 7, 13), ObservationType.WEIGHT, "92.3")

        points = ChartService(session).metric_points(
            user_id=user.id,
            observation_type=ObservationType.WEIGHT,
            days="7",
            today=date(2026, 7, 13),
        )

        assert [point.model_dump() for point in points] == [
            {"date": "2026-07-07", "value": 92.1},
            {"date": "2026-07-13", "value": 92.3},
        ]


def test_metric_points_all_returns_all_available_values():
    with make_session() as session:
        user = make_user(session)
        service = ObservationService(session)
        service.upsert(user, date(2026, 6, 1), ObservationType.SONGS, "1")
        service.upsert(user, date(2026, 7, 13), ObservationType.SONGS, "4")
        service.upsert(user, date(2026, 8, 1), ObservationType.SONGS, "6")

        points = ChartService(session).metric_points(
            user_id=user.id,
            observation_type=ObservationType.SONGS,
            days="all",
            today=date(2026, 7, 13),
        )

        assert [point.model_dump() for point in points] == [
            {"date": "2026-06-01", "value": 1},
            {"date": "2026-07-13", "value": 4},
            {"date": "2026-08-01", "value": 6},
        ]


def test_metric_points_skip_invalid_stored_values():
    with make_session() as session:
        user = make_user(session)
        session.add(
            Observation(
                user_id=user.id,
                date=date(2026, 7, 13),
                type=ObservationType.PULSE,
                value="not-a-number",
            )
        )
        ObservationService(session).upsert(
            user, date(2026, 7, 12), ObservationType.PULSE, "71"
        )
        session.commit()

        points = ChartService(session).metric_points(
            user_id=user.id,
            observation_type=ObservationType.PULSE,
            days="30",
            today=date(2026, 7, 13),
        )

        assert [point.model_dump() for point in points] == [
            {"date": "2026-07-12", "value": 71}
        ]


def test_bp_points_split_systolic_and_diastolic():
    with make_session() as session:
        user = make_user(session)
        service = ObservationService(session)
        service.upsert(user, date(2026, 7, 13), ObservationType.BP, "121/78")

        points = ChartService(session).bp_points(
            user_id=user.id,
            days="30",
            today=date(2026, 7, 13),
        )

        assert [point.model_dump() for point in points] == [
            {"date": "2026-07-13", "systolic": 121, "diastolic": 78}
        ]


def test_nyha_points_return_all_time_values():
    with make_session() as session:
        user = make_user(session)
        service = ObservationService(session)
        service.upsert(user, date(2026, 5, 1), ObservationType.NYHA, "4")
        service.upsert(user, date(2026, 7, 13), ObservationType.NYHA, "2")

        points = ChartService(session).nyha_points(user_id=user.id)

        assert [point.model_dump() for point in points] == [
            {"date": "2026-05-01", "value": 4},
            {"date": "2026-07-13", "value": 2},
        ]


def test_chart_data_is_scoped_to_user():
    with make_session() as session:
        simon = make_user(session, "simon")
        vicky = make_user(session, "vicky")
        service = ObservationService(session)
        service.upsert(simon, date(2026, 7, 13), ObservationType.WALK_DISTANCE, "325")
        service.upsert(vicky, date(2026, 7, 13), ObservationType.WALK_DISTANCE, "999")

        points = ChartService(session).metric_points(
            user_id=simon.id,
            observation_type=ObservationType.WALK_DISTANCE,
            days="30",
            today=date(2026, 7, 13),
        )

        assert [point.model_dump() for point in points] == [
            {"date": "2026-07-13", "value": 325}
        ]


def test_invalid_range_raises_chart_range_error():
    with make_session() as session:
        user = make_user(session)

        with pytest.raises(ChartRangeError):
            ChartService(session).metric_points(
                user_id=user.id,
                observation_type=ObservationType.WEIGHT,
                days="14",
                today=date(2026, 7, 13),
            )
