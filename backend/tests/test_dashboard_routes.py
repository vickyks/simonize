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


def test_dashboard_requires_auth():
    with make_session() as session:
        client = make_client(session)
        try:
            response = client.get("/api/dashboard")
            assert response.status_code == 401
        finally:
            clear_overrides()


def test_dashboard_returns_view_model():
    with make_session() as session:
        user = seed_user(session)
        ObservationService(session).upsert(
            user, date.today(), ObservationType.WEIGHT, "92.3"
        )
        client = make_client(session)
        headers = {"Authorization": f"Bearer {token_for(session, user)}"}
        try:
            response = client.get("/api/dashboard", headers=headers)
            body = response.json()

            assert response.status_code == 200
            assert body["today"]["weight"] == 92.3
            assert "weight_7d" in body["trends"]
            assert body["advisory"]["status"] in {"green", "amber", "red"}
        finally:
            clear_overrides()


def test_dashboard_is_scoped_to_current_user():
    with make_session() as session:
        simon = seed_user(session, "simon")
        vicky = seed_user(session, "vicky")
        ObservationService(session).upsert(
            simon, date.today(), ObservationType.WEIGHT, "92.3"
        )
        client = make_client(session)
        headers = {"Authorization": f"Bearer {token_for(session, vicky)}"}
        try:
            response = client.get("/api/dashboard", headers=headers)
            assert response.status_code == 200
            assert response.json()["today"]["weight"] is None
        finally:
            clear_overrides()
