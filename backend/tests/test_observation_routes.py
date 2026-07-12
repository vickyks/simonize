from datetime import date

from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.database import get_session
from app.main import app
from app.models.observation import ObservationType
from app.models.user import User
from app.services.auth_service import AuthService
from app.services.observation_service import ObservationService


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
    user = User(username=username, hashed_password=AuthService(session).hash_password("secret-password"))
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def token_for(session: Session, user: User) -> str:
    return AuthService(session).create_access_token(user)


def test_get_observations_requires_auth():
    with make_session() as session:
        client = make_client(session)
        try:
            response = client.get("/api/observations/2026-06-27")
            assert response.status_code == 401
        finally:
            clear_overrides()


def test_put_observation_requires_auth():
    with make_session() as session:
        client = make_client(session)
        try:
            response = client.put("/api/observations/2026-06-27/weight", json={"value": "92.3"})
            assert response.status_code == 401
        finally:
            clear_overrides()


def test_put_and_get_weight_updates_checklist():
    with make_session() as session:
        user = seed_user(session)
        client = make_client(session)
        headers = {"Authorization": f"Bearer {token_for(session, user)}"}
        try:
            saved = client.put(
                "/api/observations/2026-06-27/weight",
                headers=headers,
                json={"value": "92.3"},
            )
            loaded = client.get("/api/observations/2026-06-27", headers=headers)

            assert saved.status_code == 200
            assert saved.json()["value"] == "92.3"
            assert loaded.status_code == 200
            assert loaded.json()["observations"]["weight"]["value"] == "92.3"
            checklist = {item["type"]: item for item in loaded.json()["checklist"]}
            assert checklist["weight"]["recorded"] is True
            assert checklist["songs"]["label"] == "Guitar"
            assert checklist["songs"]["recorded"] is False
        finally:
            clear_overrides()


def test_routes_are_scoped_to_current_user():
    with make_session() as session:
        simon = seed_user(session, "simon")
        vicky = seed_user(session, "vicky")
        ObservationService(session).upsert(simon, date(2026, 6, 27), ObservationType.WEIGHT, "92.3")
        client = make_client(session)
        headers = {"Authorization": f"Bearer {token_for(session, vicky)}"}
        try:
            response = client.get("/api/observations/2026-06-27", headers=headers)
            assert response.status_code == 200
            assert "weight" not in response.json()["observations"]
        finally:
            clear_overrides()


def test_invalid_value_returns_422():
    with make_session() as session:
        user = seed_user(session)
        client = make_client(session)
        headers = {"Authorization": f"Bearer {token_for(session, user)}"}
        try:
            response = client.put(
                "/api/observations/2026-06-27/bp",
                headers=headers,
                json={"value": "78/121"},
            )
            assert response.status_code == 422
            assert "detail" in response.json()
        finally:
            clear_overrides()


def test_historical_date_returns_only_that_date():
    with make_session() as session:
        user = seed_user(session)
        service = ObservationService(session)
        service.upsert(user, date(2026, 6, 27), ObservationType.WEIGHT, "92.3")
        service.upsert(user, date(2026, 6, 28), ObservationType.WEIGHT, "92.1")
        client = make_client(session)
        headers = {"Authorization": f"Bearer {token_for(session, user)}"}
        try:
            response = client.get("/api/observations/2026-06-28", headers=headers)
            assert response.status_code == 200
            assert response.json()["observations"]["weight"]["value"] == "92.1"
        finally:
            clear_overrides()
