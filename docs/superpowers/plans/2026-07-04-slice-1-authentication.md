# Slice 1 Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Slice 1 authentication so Simonizer requires login, issues user-scoped JWTs, restores sessions via refresh cookies, and protects API routes.

**Architecture:** The backend owns authentication: a `users` table stores bcrypt password hashes, startup seeds one configured user, auth routes issue access/refresh JWTs, and `current_user` loads the exact database user from the JWT `sub`. The frontend keeps the access token in React memory only, restores from the httpOnly refresh cookie on page load, redirects to `/login` on `401`, and logs out through the backend.

**Tech Stack:** FastAPI, SQLModel, Alembic, PostgreSQL, python-jose, passlib bcrypt, React, TypeScript, Vite, Docker Compose, pytest, Ruff, ESLint.

## Global Constraints

- Slice 1 implements one seeded user from `ADMIN_USERNAME` and `ADMIN_PASSWORD`.
- Slice 1 must not implement user management UI, multiple seeded users, roles, password reset, or email.
- JWT access and refresh tokens must include the authenticated user's database id as `sub`.
- A JWT for one user must not grant access to another user's data in future routes.
- Access tokens are stored only in frontend memory, never `localStorage` or `sessionStorage`.
- Refresh tokens are stored only as httpOnly cookies.
- Cookie settings are `httponly=True`, `samesite="lax"`, `secure=False`, path `/api/auth`.
- Protected routes use a reusable `current_user` dependency.
- All `/api/*` routes are protected except `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`, and `/health`.
- Backend tests must cover login success/failure, refresh success/failure, `/api/auth/me` protection, missing-user token rejection, and logout cookie clearing.
- CI checks must continue to pass: Ruff, pytest, ESLint, TypeScript, frontend build, Docker compose validation/build.

---

## File Structure

- Create `backend/app/models/user.py`: SQLModel `User` table.
- Modify `backend/app/models/__init__.py`: import `User` so Alembic sees metadata.
- Create `backend/alembic/versions/20260704_0001_create_users.py`: users table migration.
- Create `backend/app/schemas/auth.py`: Pydantic request/response models.
- Create `backend/app/services/auth_service.py`: password hashing, seed user, authenticate, token creation/verification, `current_user`.
- Create `backend/app/routers/auth.py`: login, refresh, logout, me endpoints.
- Modify `backend/app/main.py`: include auth router and run seeding on startup.
- Create/modify backend tests in `backend/tests/test_auth.py` and `backend/tests/conftest.py`.
- Create frontend auth files: `frontend/src/api/auth.ts`, `frontend/src/auth/AuthContext.tsx`, `frontend/src/pages/Login.tsx`.
- Modify `frontend/src/App.tsx`: session restore, login route, protected app shell, logout.

---

### Task 1: User Model, Migration, And Auth Service Core

**Files:**
- Create: `backend/app/models/user.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/alembic/versions/20260704_0001_create_users.py`
- Create: `backend/app/services/auth_service.py`
- Test: `backend/tests/test_auth_service.py`

**Interfaces:**
- Produces `User` model with fields `id: uuid.UUID`, `username: str`, `hashed_password: str`, `created_at: datetime`.
- Produces `AuthService(session)` with methods:
  - `hash_password(password: str) -> str`
  - `verify_password(plain_password: str, hashed_password: str) -> bool`
  - `seed_admin_user() -> User`
  - `authenticate(username: str, password: str) -> User | None`
  - `create_access_token(user: User) -> str`
  - `create_refresh_token(user: User) -> str`
  - `get_user_from_token(token: str, token_type: str = "access") -> User | None`
- Later tasks consume these service methods from routes and dependencies.

- [ ] **Step 1: Write failing auth service tests**

Create `backend/tests/test_auth_service.py` with tests that use an in-memory SQLite engine and temporary settings monkeypatches:

```python
from sqlmodel import Session, SQLModel, create_engine

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
DB_PASSWORD=password SECRET_KEY=change-me-in-production ADMIN_USERNAME=simon ADMIN_PASSWORD=change-me-in-production NGINX_HTTP_PORT=80 docker-compose run --rm backend sh -c "pip install -r requirements-dev.txt && PYTHONPATH=. pytest tests/test_auth_service.py -v"
```

Expected: FAIL because `app.models.user` and `app.services.auth_service` do not exist.

- [ ] **Step 3: Create user model**

Create `backend/app/models/user.py`:

```python
import uuid
from datetime import UTC, datetime

from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    username: str = Field(index=True, unique=True, nullable=False)
    hashed_password: str = Field(nullable=False)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC), nullable=False)
```

Modify `backend/app/models/__init__.py`:

```python
from app.models.user import User

__all__ = ["User"]
```

- [ ] **Step 4: Add migration**

Create `backend/alembic/versions/20260704_0001_create_users.py`:

```python
"""create users

Revision ID: 20260704_0001
Revises: 
Create Date: 2026-07-04
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260704_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("username", sa.String(), nullable=False),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_username", "users", ["username"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_username", table_name="users")
    op.drop_table("users")
```

- [ ] **Step 5: Create auth service**

Create `backend/app/services/auth_service.py`:

```python
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
        user = self.session.exec(
            select(User).where(User.username == settings.admin_username)
        ).first()
        if user is None:
            user = User(
                username=settings.admin_username,
                hashed_password=self.hash_password(settings.admin_password),
            )
            self.session.add(user)
            self.session.commit()
            self.session.refresh(user)
            return user

        if not self.verify_password(settings.admin_password, user.hashed_password):
            user.hashed_password = self.hash_password(settings.admin_password)
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

    def get_user_from_token(self, token: str, token_type: str = "access") -> User | None:
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

    def _create_token(self, user: User, token_type: str, expires_delta: timedelta) -> str:
        expires_at = datetime.now(UTC) + expires_delta
        payload = {"sub": str(user.id), "type": token_type, "exp": expires_at}
        return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)
```

- [ ] **Step 6: Run auth service tests**

Run:

```bash
DB_PASSWORD=password SECRET_KEY=change-me-in-production ADMIN_USERNAME=simon ADMIN_PASSWORD=change-me-in-production NGINX_HTTP_PORT=80 docker-compose run --rm backend sh -c "pip install -r requirements-dev.txt && PYTHONPATH=. pytest tests/test_auth_service.py -v"
```

Expected: all tests in `test_auth_service.py` pass.

- [ ] **Step 7: Run backend lint/tests**

Run:

```bash
DB_PASSWORD=password SECRET_KEY=change-me-in-production ADMIN_USERNAME=simon ADMIN_PASSWORD=change-me-in-production NGINX_HTTP_PORT=80 docker-compose run --rm backend sh -c "pip install -r requirements-dev.txt && ruff check . && PYTHONPATH=. pytest"
```

Expected: Ruff passes and all backend tests pass.

- [ ] **Step 8: Commit Task 1**

Run:

```bash
git add backend/app/models backend/app/services/auth_service.py backend/alembic/versions/20260704_0001_create_users.py backend/tests/test_auth_service.py
git commit -m "Add user auth service"
```

---

### Task 2: Auth Routes, Startup Seeding, And Protected Dependency

**Files:**
- Create: `backend/app/schemas/auth.py`
- Create: `backend/app/routers/auth.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_auth_routes.py`

**Interfaces:**
- Consumes `AuthService` and `User` from Task 1.
- Produces FastAPI router at `/api/auth`.
- Produces dependency `current_user(session: Session, authorization: str | None) -> User` in `backend/app/routers/auth.py`.
- Produces startup function `seed_admin_user()` called by FastAPI lifespan/startup.

- [ ] **Step 1: Write failing route tests**

Create `backend/tests/test_auth_routes.py`:

```python
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from app.config import settings
from app.database import get_session
from app.main import app
from app.models.user import User
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
DB_PASSWORD=password SECRET_KEY=change-me-in-production ADMIN_USERNAME=simon ADMIN_PASSWORD=change-me-in-production NGINX_HTTP_PORT=80 docker-compose run --rm backend sh -c "pip install -r requirements-dev.txt && PYTHONPATH=. pytest tests/test_auth_routes.py -v"
```

Expected: FAIL because auth router and schemas do not exist or are not mounted.

- [ ] **Step 3: Add auth schemas**

Create `backend/app/schemas/auth.py`:

```python
from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class CurrentUserResponse(BaseModel):
    username: str


class StatusResponse(BaseModel):
    status: str
```

- [ ] **Step 4: Add auth router**

Create `backend/app/routers/auth.py`:

```python
from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Response, status
from sqlmodel import Session

from app.database import get_session
from app.models.user import User
from app.schemas.auth import CurrentUserResponse, LoginRequest, StatusResponse, TokenResponse
from app.services.auth_service import AuthService

REFRESH_COOKIE_NAME = "refresh_token"

router = APIRouter(prefix="/api/auth", tags=["auth"])


def set_refresh_cookie(response: Response, refresh_token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        samesite="lax",
        secure=False,
        path="/api/auth",
    )


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key=REFRESH_COOKIE_NAME, path="/api/auth", samesite="lax")


def current_user(
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_session),
) -> User:
    if authorization is None or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    token = authorization.removeprefix("Bearer ").strip()
    user = AuthService(session).get_user_from_token(token)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    return user


@router.post("/login", response_model=TokenResponse)
async def login(
    request: LoginRequest,
    response: Response,
    session: Session = Depends(get_session),
) -> TokenResponse:
    service = AuthService(session)
    user = service.authenticate(request.username, request.password)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    set_refresh_cookie(response, service.create_refresh_token(user))
    return TokenResponse(access_token=service.create_access_token(user))


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    response: Response,
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE_NAME),
    session: Session = Depends(get_session),
) -> TokenResponse:
    if refresh_token is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    service = AuthService(session)
    user = service.get_user_from_token(refresh_token, token_type="refresh")
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    set_refresh_cookie(response, service.create_refresh_token(user))
    return TokenResponse(access_token=service.create_access_token(user))


@router.post("/logout", response_model=StatusResponse)
async def logout(response: Response) -> StatusResponse:
    clear_refresh_cookie(response)
    return StatusResponse(status="ok")


@router.get("/me", response_model=CurrentUserResponse)
async def me(user: User = Depends(current_user)) -> CurrentUserResponse:
    return CurrentUserResponse(username=user.username)
```

- [ ] **Step 5: Mount router and seed startup user**

Modify `backend/app/main.py`:

```python
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.database import get_session
from app.routers.auth import router as auth_router
from app.services.auth_service import AuthService


@asynccontextmanager
async def lifespan(app: FastAPI):
    for session in get_session():
        AuthService(session).seed_admin_user()
        break
    yield


app = FastAPI(title="Simonizer API", lifespan=lifespan)
app.include_router(auth_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 6: Run route tests**

Run:

```bash
DB_PASSWORD=password SECRET_KEY=change-me-in-production ADMIN_USERNAME=simon ADMIN_PASSWORD=change-me-in-production NGINX_HTTP_PORT=80 docker-compose run --rm backend sh -c "pip install -r requirements-dev.txt && PYTHONPATH=. pytest tests/test_auth_routes.py -v"
```

Expected: all auth route tests pass.

- [ ] **Step 7: Run full backend checks**

Run:

```bash
DB_PASSWORD=password SECRET_KEY=change-me-in-production ADMIN_USERNAME=simon ADMIN_PASSWORD=change-me-in-production NGINX_HTTP_PORT=80 docker-compose run --rm backend sh -c "pip install -r requirements-dev.txt && ruff check . && PYTHONPATH=. pytest"
```

Expected: Ruff passes and all backend tests pass.

- [ ] **Step 8: Commit Task 2**

Run:

```bash
git add backend/app/main.py backend/app/routers/auth.py backend/app/schemas/auth.py backend/tests/test_auth_routes.py
git commit -m "Add auth API routes"
```

---

### Task 3: Frontend Auth Session, Login, And Logout

**Files:**
- Create: `frontend/src/api/auth.ts`
- Create: `frontend/src/auth/AuthContext.tsx`
- Create: `frontend/src/pages/Login.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes backend endpoints `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`, `/api/auth/me`.
- Produces `AuthProvider`, `useAuth()`, and login/logout/session restore behavior.
- Produces no token persistence in localStorage/sessionStorage.

- [ ] **Step 1: Add auth API wrapper**

Create `frontend/src/api/auth.ts`:

```typescript
export type TokenResponse = {
  access_token: string
  token_type: 'bearer'
}

export type CurrentUser = {
  username: string
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(String(response.status))
  }
  return response.json() as Promise<T>
}

export async function login(username: string, password: string): Promise<TokenResponse> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ username, password }),
  })
  return parseJson<TokenResponse>(response)
}

export async function refresh(): Promise<TokenResponse> {
  const response = await fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  })
  return parseJson<TokenResponse>(response)
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
  })
}

export async function getCurrentUser(accessToken: string): Promise<CurrentUser> {
  const response = await fetch('/api/auth/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: 'include',
  })
  return parseJson<CurrentUser>(response)
}
```

- [ ] **Step 2: Add auth context**

Create `frontend/src/auth/AuthContext.tsx`:

```tsx
import { createContext, ReactNode, useContext, useEffect, useState } from 'react'
import * as authApi from '../api/auth'

type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

type AuthContextValue = {
  accessToken: string | null
  status: AuthStatus
  username: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [username, setUsername] = useState<string | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')

  useEffect(() => {
    let cancelled = false
    async function restoreSession() {
      try {
        const token = await authApi.refresh()
        const user = await authApi.getCurrentUser(token.access_token)
        if (!cancelled) {
          setAccessToken(token.access_token)
          setUsername(user.username)
          setStatus('authenticated')
        }
      } catch {
        if (!cancelled) {
          setAccessToken(null)
          setUsername(null)
          setStatus('anonymous')
        }
      }
    }
    restoreSession()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleLogin(usernameValue: string, password: string) {
    const token = await authApi.login(usernameValue, password)
    const user = await authApi.getCurrentUser(token.access_token)
    setAccessToken(token.access_token)
    setUsername(user.username)
    setStatus('authenticated')
  }

  async function handleLogout() {
    await authApi.logout()
    setAccessToken(null)
    setUsername(null)
    setStatus('anonymous')
  }

  return (
    <AuthContext.Provider
      value={{ accessToken, status, username, login: handleLogin, logout: handleLogout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === null) {
    throw new Error('useAuth must be used inside AuthProvider')
  }
  return context
}
```

- [ ] **Step 3: Add login page**

Create `frontend/src/pages/Login.tsx`:

```tsx
import { FormEvent, useState } from 'react'

import { useAuth } from '../auth/AuthContext'

export function Login() {
  const auth = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    try {
      await auth.login(username, password)
      window.history.replaceState(null, '', '/')
    } catch {
      setError('That username or password did not work.')
    }
  }

  return (
    <main style={{ maxWidth: '28rem', margin: '4rem auto', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Welcome back</h1>
      <p>Log in to continue tracking Simon's recovery.</p>
      <form onSubmit={handleSubmit}>
        <label>
          Username
          <input
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            style={{ display: 'block', marginBottom: '1rem', width: '100%' }}
          />
        </label>
        <label>
          Password
          <input
            autoComplete="current-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            style={{ display: 'block', marginBottom: '1rem', width: '100%' }}
          />
        </label>
        {error ? <p role="alert">{error}</p> : null}
        <button type="submit">Log in</button>
      </form>
    </main>
  )
}
```

- [ ] **Step 4: Protect app shell and add logout**

Modify `frontend/src/App.tsx`:

```tsx
import { AuthProvider, useAuth } from './auth/AuthContext'
import { Login } from './pages/Login'

function AppContent() {
  const auth = useAuth()

  if (auth.status === 'loading') {
    return <p>Loading...</p>
  }

  if (auth.status === 'anonymous' || window.location.pathname === '/login') {
    return <Login />
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', margin: '2rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <h1>Simonizer</h1>
          <p>Signed in as {auth.username}</p>
        </div>
        <button type="button" onClick={() => void auth.logout()}>
          Log out
        </button>
      </header>
    </main>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
```

- [ ] **Step 5: Verify no browser storage token usage**

Run:

```bash
grep -R "localStorage\|sessionStorage" frontend/src || true
```

Expected: no output.

- [ ] **Step 6: Run frontend checks**

Run:

```bash
DB_PASSWORD=password SECRET_KEY=change-me-in-production ADMIN_USERNAME=simon ADMIN_PASSWORD=change-me-in-production NGINX_HTTP_PORT=80 docker-compose run --rm frontend npm run lint
DB_PASSWORD=password SECRET_KEY=change-me-in-production ADMIN_USERNAME=simon ADMIN_PASSWORD=change-me-in-production NGINX_HTTP_PORT=80 docker-compose run --rm frontend npm run typecheck
DB_PASSWORD=password SECRET_KEY=change-me-in-production ADMIN_USERNAME=simon ADMIN_PASSWORD=change-me-in-production NGINX_HTTP_PORT=80 docker-compose run --rm frontend npm run build
```

Expected: all pass.

- [ ] **Step 7: Commit Task 3**

Run:

```bash
git add frontend/src
git commit -m "Add frontend authentication flow"
```

---

### Task 4: End-To-End Verification And Deployment Readiness

**Files:**
- Modify: `README.md`
- Modify: `docs/deployment.md`

**Interfaces:**
- Consumes backend and frontend auth from Tasks 1-3.
- Produces updated operational docs for migrations and seeded admin credentials.

- [ ] **Step 1: Update README Slice 1 state**

Modify `README.md` current state section to mention authentication is implemented and add a short note that initial login uses `ADMIN_USERNAME` / `ADMIN_PASSWORD` from `.env`.

- [ ] **Step 2: Update deployment docs**

Modify `docs/deployment.md` to say deployments must run migrations before startup because Slice 1 adds the `users` table, and the app seeds/updates the configured admin user at startup.

- [ ] **Step 3: Run backend migration command locally**

Run:

```bash
DB_PASSWORD=password SECRET_KEY=change-me-in-production ADMIN_USERNAME=simon ADMIN_PASSWORD=change-me-in-production NGINX_HTTP_PORT=80 docker-compose build backend
DB_PASSWORD=password SECRET_KEY=change-me-in-production ADMIN_USERNAME=simon ADMIN_PASSWORD=change-me-in-production NGINX_HTTP_PORT=80 docker-compose run --rm backend sh -c "PYTHONPATH=. alembic upgrade head"
```

Expected: Alembic completes successfully.

- [ ] **Step 4: Run full local check suite**

Run:

```bash
just check
```

Expected: backend Ruff, backend pytest, frontend ESLint, frontend typecheck, and frontend build pass.

- [ ] **Step 5: Smoke test running stack auth flow**

Run:

```bash
DB_PASSWORD=password SECRET_KEY=change-me-in-production ADMIN_USERNAME=simon ADMIN_PASSWORD=change-me-in-production NGINX_HTTP_PORT=80 docker-compose up -d --build
curl -fsS http://localhost/api/auth/me -o /tmp/me.out -w "%{http_code}\n"
curl -fsS -c /tmp/simonizer-cookies.txt -H 'Content-Type: application/json' -d '{"username":"simon","password":"change-me-in-production"}' http://localhost/api/auth/login
curl -fsS -b /tmp/simonizer-cookies.txt -X POST http://localhost/api/auth/refresh
```

Expected:

- `/api/auth/me` without token prints `401`.
- Login returns JSON containing `access_token` and `token_type`.
- Refresh returns JSON containing `access_token` and `token_type`.

- [ ] **Step 6: Commit Task 4**

Run:

```bash
git add README.md docs/deployment.md
git commit -m "Document authentication operations"
```

- [ ] **Step 7: Final review and push**

Run:

```bash
git status --short
git log --oneline -8
```

Expected: worktree clean and Slice 1 commits visible. After final review, push to the chosen branch.
