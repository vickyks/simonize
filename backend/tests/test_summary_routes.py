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


def test_summary_requires_auth():
    with make_session() as session:
        client = make_client(session)
        try:
            response = client.get("/api/summary")
            assert response.status_code == 401
        finally:
            clear_overrides()


def test_summary_defaults_to_7_days_and_is_scoped_to_current_user():
    with make_session() as session:
        simon = seed_user(session, "simon")
        vicky = seed_user(session, "vicky")
        service = ObservationService(session)
        service.upsert(simon, date.today(), ObservationType.WEIGHT, "92.3")
        service.upsert(vicky, date.today(), ObservationType.WEIGHT, "99.9")
        client = make_client(session)
        headers = {"Authorization": f"Bearer {token_for(session, simon)}"}
        try:
            response = client.get("/api/summary", headers=headers)
            body = response.json()
            assert response.status_code == 200
            assert body["range"]["days"] == 7
            assert body["vitals"]["weight"] == [
                {"date": date.today().isoformat(), "value": 92.3}
            ]
        finally:
            clear_overrides()


def test_summary_accepts_30_days():
    with make_session() as session:
        user = seed_user(session)
        client = make_client(session)
        headers = {"Authorization": f"Bearer {token_for(session, user)}"}
        try:
            response = client.get("/api/summary?days=30", headers=headers)
            assert response.status_code == 200
            assert response.json()["range"]["days"] == 30
        finally:
            clear_overrides()


def test_invalid_days_returns_422():
    with make_session() as session:
        user = seed_user(session)
        client = make_client(session)
        headers = {"Authorization": f"Bearer {token_for(session, user)}"}
        try:
            response = client.get("/api/summary?days=14", headers=headers)
            assert response.status_code == 422
            assert "detail" in response.json()
        finally:
            clear_overrides()
