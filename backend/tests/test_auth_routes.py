from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.config import settings
from app.database import get_session
from app.main import app
from app.services.auth_service import AuthService


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


def seed(session: Session):
    return AuthService(session).seed_admin_user()


def test_login_success_sets_refresh_cookie(monkeypatch):
    monkeypatch.setattr(settings, "admin_username", "simon")
    monkeypatch.setattr(settings, "admin_password", "secret-password")
    monkeypatch.setattr(settings, "secret_key", "test-secret-key")
    with make_session() as session:
        seed(session)
        client = make_client(session)
        try:
            response = client.post(
                "/api/auth/login",
                json={"username": "simon", "password": "secret-password"},
            )
            assert response.status_code == 200
            assert response.json()["token_type"] == "bearer"
            assert response.json()["access_token"]
            assert "refresh_token" in response.cookies
        finally:
            clear_overrides()


def test_login_wrong_password_returns_401(monkeypatch):
    monkeypatch.setattr(settings, "admin_username", "simon")
    monkeypatch.setattr(settings, "admin_password", "secret-password")
    monkeypatch.setattr(settings, "secret_key", "test-secret-key")
    with make_session() as session:
        seed(session)
        client = make_client(session)
        try:
            response = client.post(
                "/api/auth/login",
                json={"username": "simon", "password": "wrong"},
            )
            assert response.status_code == 401
        finally:
            clear_overrides()


def test_refresh_without_cookie_returns_401():
    with make_session() as session:
        client = make_client(session)
        try:
            response = client.post("/api/auth/refresh")
            assert response.status_code == 401
        finally:
            clear_overrides()


def test_refresh_with_cookie_returns_new_access_token(monkeypatch):
    monkeypatch.setattr(settings, "admin_username", "simon")
    monkeypatch.setattr(settings, "admin_password", "secret-password")
    monkeypatch.setattr(settings, "secret_key", "test-secret-key")
    with make_session() as session:
        seed(session)
        client = make_client(session)
        try:
            login = client.post(
                "/api/auth/login",
                json={"username": "simon", "password": "secret-password"},
            )
            response = client.post("/api/auth/refresh")
            assert login.status_code == 200
            assert response.status_code == 200
            assert response.json()["access_token"]
        finally:
            clear_overrides()


def test_me_requires_bearer_token():
    with make_session() as session:
        client = make_client(session)
        try:
            response = client.get("/api/auth/me")
            assert response.status_code == 401
        finally:
            clear_overrides()


def test_me_returns_username_with_valid_token(monkeypatch):
    monkeypatch.setattr(settings, "admin_username", "simon")
    monkeypatch.setattr(settings, "admin_password", "secret-password")
    monkeypatch.setattr(settings, "secret_key", "test-secret-key")
    with make_session() as session:
        seed(session)
        client = make_client(session)
        try:
            login = client.post(
                "/api/auth/login",
                json={"username": "simon", "password": "secret-password"},
            )
            token = login.json()["access_token"]
            response = client.get(
                "/api/auth/me", headers={"Authorization": f"Bearer {token}"}
            )
            assert response.status_code == 200
            assert response.json() == {"username": "simon"}
        finally:
            clear_overrides()


def test_me_rejects_token_for_missing_user(monkeypatch):
    monkeypatch.setattr(settings, "admin_username", "simon")
    monkeypatch.setattr(settings, "admin_password", "secret-password")
    monkeypatch.setattr(settings, "secret_key", "test-secret-key")
    with make_session() as session:
        user = seed(session)
        token = AuthService(session).create_access_token(user)
        session.delete(user)
        session.commit()
        client = make_client(session)
        try:
            response = client.get(
                "/api/auth/me", headers={"Authorization": f"Bearer {token}"}
            )
            assert response.status_code == 401
        finally:
            clear_overrides()


def test_logout_clears_refresh_cookie(monkeypatch):
    monkeypatch.setattr(settings, "admin_username", "simon")
    monkeypatch.setattr(settings, "admin_password", "secret-password")
    monkeypatch.setattr(settings, "secret_key", "test-secret-key")
    with make_session() as session:
        seed(session)
        client = make_client(session)
        try:
            client.post(
                "/api/auth/login",
                json={"username": "simon", "password": "secret-password"},
            )
            response = client.post("/api/auth/logout")
            assert response.status_code == 200
            assert response.json() == {"status": "ok"}
            assert response.cookies.get("refresh_token") in (None, "")
        finally:
            clear_overrides()
