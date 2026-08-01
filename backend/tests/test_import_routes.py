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


def test_import_preview_requires_auth():
    with make_session() as session:
        client = make_client(session)
        try:
            response = client.post(
                "/api/import/observations/preview",
                json={"text": "Date\n"},
            )
            assert response.status_code == 401
        finally:
            clear_overrides()


def test_import_preview_returns_rows_and_items():
    with make_session() as session:
        user = seed_user(session)
        ObservationService(session).upsert(
            user,
            date(2026, 6, 28),
            ObservationType.WEIGHT,
            "81.0",
        )
        client = make_client(session)
        headers = {"Authorization": f"Bearer {token_for(session, user)}"}
        try:
            response = client.post(
                "/api/import/observations/preview",
                headers=headers,
                json={"text": "Date\tColumn 2\tColumn 1\n28/06/2026\t80.9\t97\n"},
            )
            assert response.status_code == 200
            assert response.json()["summary"]["total_rows"] == 1
            assert {item["type"] for item in response.json()["items"]} == {
                "weight",
                "oxygen",
            }
            items = response.json()["items"]
            weight = next(item for item in items if item["type"] == "weight")
            oxygen = next(item for item in items if item["type"] == "oxygen")
            assert weight["status"] == "conflict"
            assert weight["conflict"] is True
            assert oxygen["conflict"] is False
        finally:
            clear_overrides()


def test_import_apply_rejects_malformed_items():
    with make_session() as session:
        user = seed_user(session)
        client = make_client(session)
        headers = {"Authorization": f"Bearer {token_for(session, user)}"}
        try:
            response = client.post(
                "/api/import/observations/apply",
                headers=headers,
                json={
                    "items": [
                        {
                            "row": 2,
                            "date": "not-a-date",
                            "type": "not-a-type",
                            "label": "Weight",
                            "incoming_value": "80.9",
                            "status": "ready",
                        }
                    ]
                },
            )

            assert response.status_code == 422
        finally:
            clear_overrides()
