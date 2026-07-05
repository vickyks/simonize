from sqlmodel import Session, SQLModel, create_engine, select

from app.config import settings
from app.models.user import User
from app.services.auth_service import AuthService


def make_session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    return Session(engine)


def test_seed_admin_user_creates_user(monkeypatch):
    monkeypatch.setattr(settings, "admin_username", "simon")
    monkeypatch.setattr(settings, "admin_password", "secret-password")

    with make_session() as session:
        user = AuthService(session).seed_admin_user()

        assert user.username == "simon"
        assert user.is_seeded is True
        assert user.hashed_password != "secret-password"
        assert AuthService(session).verify_password("secret-password", user.hashed_password)


def test_seed_admin_user_updates_password(monkeypatch):
    monkeypatch.setattr(settings, "admin_username", "simon")
    monkeypatch.setattr(settings, "admin_password", "first-password")

    with make_session() as session:
        service = AuthService(session)
        user = service.seed_admin_user()
        first_hash = user.hashed_password

        monkeypatch.setattr(settings, "admin_password", "second-password")
        updated = service.seed_admin_user()

        assert updated.id == user.id
        assert updated.hashed_password != first_hash
        assert service.verify_password("second-password", updated.hashed_password)


def test_seed_admin_user_updates_existing_user_when_credentials_rotate(monkeypatch):
    monkeypatch.setattr(settings, "admin_username", "simon")
    monkeypatch.setattr(settings, "admin_password", "first-password")

    with make_session() as session:
        service = AuthService(session)
        user = service.seed_admin_user()

        monkeypatch.setattr(settings, "admin_username", "simon-new")
        monkeypatch.setattr(settings, "admin_password", "second-password")
        updated = service.seed_admin_user()

        users = session.exec(select(User)).all()

        assert updated.id == user.id
        assert updated.username == "simon-new"
        assert updated.is_seeded is True
        assert len(users) == 1
        assert service.authenticate("simon", "first-password") is None
        assert service.authenticate("simon-new", "second-password") == updated


def test_seed_admin_user_does_not_hijack_non_seeded_user(monkeypatch):
    monkeypatch.setattr(settings, "admin_username", "simon")
    monkeypatch.setattr(settings, "admin_password", "seed-password")

    with make_session() as session:
        service = AuthService(session)
        existing = User(
            username="backoffice",
            hashed_password=service.hash_password("backoffice-password"),
            is_seeded=False,
        )
        session.add(existing)
        session.commit()
        session.refresh(existing)

        seeded = service.seed_admin_user()
        users = session.exec(select(User)).all()

        assert seeded.id != existing.id
        assert seeded.username == "simon"
        assert seeded.is_seeded is True
        assert len(users) == 2
        assert service.authenticate("backoffice", "backoffice-password") == existing
        assert service.authenticate("simon", "seed-password") == seeded


def test_authenticate_returns_user_for_correct_password(monkeypatch):
    monkeypatch.setattr(settings, "admin_username", "simon")
    monkeypatch.setattr(settings, "admin_password", "secret-password")

    with make_session() as session:
        service = AuthService(session)
        service.seed_admin_user()

        user = service.authenticate("simon", "secret-password")

        assert isinstance(user, User)
        assert user.username == "simon"


def test_authenticate_returns_none_for_wrong_password(monkeypatch):
    monkeypatch.setattr(settings, "admin_username", "simon")
    monkeypatch.setattr(settings, "admin_password", "secret-password")

    with make_session() as session:
        service = AuthService(session)
        service.seed_admin_user()

        assert service.authenticate("simon", "wrong-password") is None


def test_tokens_are_scoped_to_user_id(monkeypatch):
    monkeypatch.setattr(settings, "admin_username", "simon")
    monkeypatch.setattr(settings, "admin_password", "secret-password")
    monkeypatch.setattr(settings, "secret_key", "test-secret-key")

    with make_session() as session:
        service = AuthService(session)
        user = service.seed_admin_user()
        token = service.create_access_token(user)

        token_user = service.get_user_from_token(token)

        assert token_user is not None
        assert token_user.id == user.id


def test_token_for_missing_user_returns_none(monkeypatch):
    monkeypatch.setattr(settings, "admin_username", "simon")
    monkeypatch.setattr(settings, "admin_password", "secret-password")
    monkeypatch.setattr(settings, "secret_key", "test-secret-key")

    with make_session() as session:
        service = AuthService(session)
        user = service.seed_admin_user()
        token = service.create_access_token(user)
        session.delete(user)
        session.commit()

        assert service.get_user_from_token(token) is None
