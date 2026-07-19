from app.database import get_session
from app.main import app
from app.models.target import TargetType
from app.models.user import User
from app.services.auth_service import AuthService
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


def test_targets_requires_auth():
    with make_session() as session:
        client = make_client(session)
        try:
            response = client.get("/api/targets")
            assert response.status_code == 401
        finally:
            clear_overrides()


def test_get_targets_returns_defaults():
    with make_session() as session:
        user = seed_user(session)
        client = make_client(session)
        headers = {"Authorization": f"Bearer {token_for(session, user)}"}
        try:
            response = client.get("/api/targets", headers=headers)
            assert response.status_code == 200
            assert response.json()["targets"] == [
                {
                    "type": "walk_distance",
                    "label": "Walk distance target",
                    "value": 500,
                    "unit": "m",
                },
                {
                    "type": "songs",
                    "label": "Guitar songs target",
                    "value": 5,
                    "unit": "songs",
                },
                {"type": "nyha", "label": "NYHA target", "value": 2, "unit": "class"},
            ]
        finally:
            clear_overrides()


def test_put_target_updates_current_users_value():
    with make_session() as session:
        simon = seed_user(session, "simon")
        vicky = seed_user(session, "vicky")
        client = make_client(session)
        simon_headers = {"Authorization": f"Bearer {token_for(session, simon)}"}
        vicky_headers = {"Authorization": f"Bearer {token_for(session, vicky)}"}
        try:
            response = client.put(
                f"/api/targets/{TargetType.WALK_DISTANCE}",
                headers=simon_headers,
                json={"value": 650},
            )
            assert response.status_code == 200
            assert response.json()["targets"][0]["value"] == 650
            other_response = client.get("/api/targets", headers=vicky_headers)
            assert other_response.json()["targets"][0]["value"] == 500
        finally:
            clear_overrides()


def test_invalid_target_type_and_value_return_422():
    with make_session() as session:
        user = seed_user(session)
        client = make_client(session)
        headers = {"Authorization": f"Bearer {token_for(session, user)}"}
        try:
            bad_type = client.put(
                "/api/targets/weight",
                headers=headers,
                json={"value": 10},
            )
            bad_value = client.put(
                "/api/targets/nyha",
                headers=headers,
                json={"value": 9},
            )
            assert bad_type.status_code == 422
            assert bad_value.status_code == 422
        finally:
            clear_overrides()
