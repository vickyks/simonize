from datetime import date

from app.models.observation import Observation, ObservationType
from app.models.user import User
from app.services.dashboard_service import DashboardService
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


def test_dashboard_builds_today_values_and_trends():
    with make_session() as session:
        user = make_user(session)
        service = ObservationService(session)
        service.upsert(user, date(2026, 7, 7), ObservationType.WEIGHT, "92.8")
        service.upsert(user, date(2026, 7, 12), ObservationType.WEIGHT, "92.4")
        service.upsert(user, date(2026, 7, 13), ObservationType.WEIGHT, "92.3")
        service.upsert(user, date(2026, 7, 13), ObservationType.PULSE, "71")
        service.upsert(user, date(2026, 7, 13), ObservationType.BP, "121/78")
        service.upsert(user, date(2026, 7, 13), ObservationType.WALK_DISTANCE, "325")
        service.upsert(user, date(2026, 7, 13), ObservationType.SONGS, "3")
        service.upsert(user, date(2026, 7, 13), ObservationType.NYHA, "3")

        dashboard = DashboardService(session).build(
            user_id=user.id, today=date(2026, 7, 13)
        )

        assert dashboard.today.date == "2026-07-13"
        assert dashboard.today.weight == 92.3
        assert dashboard.today.pulse == 71
        assert dashboard.today.bp == "121/78"
        assert dashboard.today.walk_distance == 325
        assert dashboard.today.songs == 3
        assert dashboard.today.nyha == 3
        assert dashboard.trends.weight_7d == [
            {"date": "2026-07-07", "value": 92.8},
            {"date": "2026-07-12", "value": 92.4},
            {"date": "2026-07-13", "value": 92.3},
        ]
        assert dashboard.advisory.status == "green"


def test_dashboard_missing_today_values_are_null():
    with make_session() as session:
        user = make_user(session)

        dashboard = DashboardService(session).build(
            user_id=user.id, today=date(2026, 7, 13)
        )

        assert dashboard.today.weight is None
        assert dashboard.today.pulse is None
        assert dashboard.today.bp is None
        assert dashboard.today.walk_distance is None
        assert dashboard.today.songs is None
        assert dashboard.today.nyha is None
        assert dashboard.trends.weight_7d == []


def test_dashboard_ignores_invalid_stored_values():
    with make_session() as session:
        user = make_user(session)
        session.add(
            Observation(
                user_id=user.id,
                date=date(2026, 7, 13),
                type=ObservationType.WEIGHT,
                value="not-a-number",
            )
        )
        session.commit()

        dashboard = DashboardService(session).build(
            user_id=user.id, today=date(2026, 7, 13)
        )

        assert dashboard.today.weight is None
        assert dashboard.trends.weight_7d == []
