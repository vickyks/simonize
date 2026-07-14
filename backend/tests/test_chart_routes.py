from datetime import date

from app.database import get_session
from app.main import app
from app.models.observation import ObservationType
from app.models.user import User
from app.services.auth_service import AuthService
from app.services.observation_service import ObservationService
from fastapi.testclient import TestClient
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


def make_client(session: Session):
    def override_session():
        yield session

    app.dependency_overrides[get_session] = override_session
    return TestClient(app)


def clear_overrides():
    app.dependency_overrides.clear()


def seed_user(session: Session, username: str = "simon") -> User:
    user = User(
        username=username,
        hashed_password=AuthService(session).hash_password("secret-password"),
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def token_for(session: Session, user: User) -> str:
    return AuthService(session).create_access_token(user)


def test_chart_endpoint_requires_auth():
    with make_session() as session:
        client = make_client(session)
        try:
            response = client.get("/api/charts/weight")
            assert response.status_code == 401
        finally:
            clear_overrides()


def test_weight_chart_defaults_to_30_days_and_is_scoped_to_current_user():
    with make_session() as session:
        simon = seed_user(session, "simon")
        vicky = seed_user(session, "vicky")
        service = ObservationService(session)
        service.upsert(simon, date.today(), ObservationType.WEIGHT, "92.3")
        service.upsert(vicky, date.today(), ObservationType.WEIGHT, "99.9")
        client = make_client(session)
        headers = {"Authorization": f"Bearer {token_for(session, simon)}"}
        try:
            response = client.get("/api/charts/weight", headers=headers)
            assert response.status_code == 200
            assert response.json() == [
                {"date": date.today().isoformat(), "value": 92.3}
            ]
        finally:
            clear_overrides()


def test_invalid_days_returns_422():
    with make_session() as session:
        user = seed_user(session)
        client = make_client(session)
        headers = {"Authorization": f"Bearer {token_for(session, user)}"}
        try:
            response = client.get("/api/charts/pulse?days=14", headers=headers)
            assert response.status_code == 422
            assert "detail" in response.json()
        finally:
            clear_overrides()


def test_bp_chart_returns_systolic_and_diastolic():
    with make_session() as session:
        user = seed_user(session)
        ObservationService(session).upsert(
            user, date.today(), ObservationType.BP, "121/78"
        )
        client = make_client(session)
        headers = {"Authorization": f"Bearer {token_for(session, user)}"}
        try:
            response = client.get("/api/charts/bp?days=30", headers=headers)
            assert response.status_code == 200
            assert response.json() == [
                {"date": date.today().isoformat(), "systolic": 121, "diastolic": 78}
            ]
        finally:
            clear_overrides()


def test_nyha_chart_returns_all_time_data():
    with make_session() as session:
        user = seed_user(session)
        service = ObservationService(session)
        service.upsert(user, date(2026, 5, 1), ObservationType.NYHA, "4")
        service.upsert(user, date.today(), ObservationType.NYHA, "2")
        client = make_client(session)
        headers = {"Authorization": f"Bearer {token_for(session, user)}"}
        try:
            response = client.get("/api/charts/nyha", headers=headers)
            assert response.status_code == 200
            assert response.json() == [
                {"date": "2026-05-01", "value": 4},
                {"date": date.today().isoformat(), "value": 2},
            ]
        finally:
            clear_overrides()
