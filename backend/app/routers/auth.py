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
