from datetime import UTC, datetime, timedelta
from uuid import UUID

from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlmodel import Session, select

from app.config import settings
from app.models.user import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
ALGORITHM = "HS256"


class AuthService:
    def __init__(self, session: Session):
        self.session = session

    def hash_password(self, password: str) -> str:
        return pwd_context.hash(password)

    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        return pwd_context.verify(plain_password, hashed_password)

    def seed_admin_user(self) -> User:
        user = self.session.exec(select(User).where(User.is_seeded)).first()
        if user is None:
            user = User(username=settings.admin_username, is_seeded=True)
            user.hashed_password = self.hash_password(settings.admin_password)
            self.session.add(user)
            self.session.commit()
            self.session.refresh(user)
            return user

        password_matches = self.verify_password(
            settings.admin_password, user.hashed_password
        )
        if user.username != settings.admin_username or not password_matches:
            user.username = settings.admin_username
            if not password_matches:
                user.hashed_password = self.hash_password(settings.admin_password)
            user.is_seeded = True
            self.session.add(user)
            self.session.commit()
            self.session.refresh(user)
        return user

    def authenticate(self, username: str, password: str) -> User | None:
        user = self.session.exec(select(User).where(User.username == username)).first()
        if user is None or not self.verify_password(password, user.hashed_password):
            return None
        return user

    def create_access_token(self, user: User) -> str:
        return self._create_token(
            user=user,
            token_type="access",
            expires_delta=timedelta(minutes=settings.access_token_expire_minutes),
        )

    def create_refresh_token(self, user: User) -> str:
        return self._create_token(
            user=user,
            token_type="refresh",
            expires_delta=timedelta(days=settings.refresh_token_expire_days),
        )

    def get_user_from_token(
        self, token: str, token_type: str = "access"
    ) -> User | None:
        try:
            payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
            if payload.get("type") != token_type:
                return None
            subject = payload.get("sub")
            if subject is None:
                return None
            user_id = UUID(subject)
        except (JWTError, ValueError):
            return None
        return self.session.get(User, user_id)

    def _create_token(
        self, user: User, token_type: str, expires_delta: timedelta
    ) -> str:
        expires_at = datetime.now(UTC) + expires_delta
        payload = {"sub": str(user.id), "type": token_type, "exp": expires_at}
        return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)
