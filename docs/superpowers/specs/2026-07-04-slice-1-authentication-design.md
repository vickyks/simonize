# Slice 1 Authentication Design

## Goal

Implement authentication so Simonizer requires login for all application API routes, while keeping the Slice 1 scope to one seeded user.

## Scope

Slice 1 implements:

- A real `users` table.
- One seeded user from `ADMIN_USERNAME` and `ADMIN_PASSWORD`.
- Username/password login.
- Short-lived JWT access tokens.
- Refresh tokens stored in an httpOnly cookie.
- Protected API routes.
- React login, session restore, automatic redirect on `401`, and logout.

Slice 1 does not implement:

- User management UI.
- Multiple seeded users.
- Roles or permissions.
- Password reset.
- Email.

The data model should not prevent a later back-office feature from adding more users.

## Backend Design

### User Model

Add `backend/app/models/user.py` with a SQLModel `User` table:

- `id`: UUID primary key
- `username`: unique indexed string
- `hashed_password`: string
- `created_at`: timezone-aware datetime

The model should match `docs/data-model.md`.

### Migration

Add an Alembic migration that creates the `users` table.

The migration should be safe to run on an empty production database and should not create application users directly. User seeding is application startup logic so changing environment credentials updates the seeded user without editing migrations.

### Seeding

Add an auth/user service that runs during FastAPI startup:

1. Read `ADMIN_USERNAME` and `ADMIN_PASSWORD` from settings.
2. Hash the password with bcrypt.
3. If the username does not exist, create the user.
4. If the username exists and the configured password no longer matches, update `hashed_password`.

This keeps a single configured account available now and allows future back-office-created users to coexist later.

### Passwords

Use `passlib[bcrypt]` for password hashing and verification.

Plaintext passwords are never stored or logged.

### Tokens

Access tokens:

- JWT signed with `SECRET_KEY`.
- Include the authenticated user's id as the token subject (`sub`).
- Expire after `ACCESS_TOKEN_EXPIRE_MINUTES`.
- Returned in JSON as `{ "access_token": "...", "token_type": "bearer" }`.
- Stored only in frontend memory.

Refresh tokens:

- JWT signed with `SECRET_KEY`.
- Include the authenticated user's id as the token subject (`sub`).
- Expire after `REFRESH_TOKEN_EXPIRE_DAYS`.
- Set as an httpOnly cookie by login and refresh endpoints.
- Cleared by logout.
- The MVP does not store refresh tokens server-side or implement token rotation persistence.

Cookie settings:

- `httponly=True`
- `samesite="lax"`
- `secure=False` for current HTTP deployment
- path `/api/auth`

When HTTPS is added later, `secure=True` should be enabled.

### Routes

Add `backend/app/routers/auth.py` with:

- `POST /api/auth/login`
  - Body: `{ "username": string, "password": string }`
  - On success: returns access token JSON and sets refresh cookie
  - On failure: returns `401`

- `POST /api/auth/refresh`
  - Reads refresh token cookie
  - On success: returns new access token JSON and refreshes cookie
  - On missing/invalid/expired refresh token: returns `401`

- `POST /api/auth/logout`
  - Clears refresh cookie
  - Returns `{ "status": "ok" }`

- `GET /api/auth/me`
  - Requires a valid access token
  - Returns `{ "username": string }`

### Route Protection

All `/api/*` routes are protected except:

- `/api/auth/login`
- `/api/auth/refresh`
- `/api/auth/logout`
- `/health`

Protection should be implemented as a FastAPI dependency for routers where possible, not as business logic inside route handlers. For Slice 1, `GET /api/auth/me` is the protected route used to prove the protection path works.

Future Slice 2+ routers should use the same `current_user` dependency.

### User Scoping

JWTs authorize exactly one user. The token subject (`sub`) is the authenticated user's database id, not a generic admin marker.

The `current_user` dependency must:

1. Decode and validate the bearer token.
2. Read the user id from `sub`.
3. Load that exact user from the database.
4. Reject the request with `401` if the user is missing or inactive in future versions.

Slice 1 does not yet have user-owned recovery data, but the auth boundary must be ready for it. Future routes that read or write user-owned data must query through `current_user` and filter by that user's id. A JWT for one user must not grant access to another user's data.

## Frontend Design

### Session State

The frontend stores the access token in React memory only.

No token is stored in `localStorage` or `sessionStorage`.

On app load:

1. Call `/api/auth/refresh` with credentials included.
2. If it succeeds, store the new access token in memory and show the app.
3. If it fails, show `/login`.

### API Wrapper

Add a small fetch wrapper that:

- Sends `Authorization: Bearer <access_token>` when an access token exists.
- Sends cookies with auth requests using `credentials: "include"`.
- On `401`, clears the in-memory access token and redirects to `/login`.

This wrapper should be the only frontend place that knows how bearer auth is attached.

### Login Page

Add a simple login page with:

- Username field
- Password field
- Submit button
- Friendly invalid-login message on `401`

After successful login, redirect to `/`.

### Logout

Add a logout action in the app shell.

Logout should:

1. Call `/api/auth/logout` with credentials included.
2. Clear the in-memory access token.
3. Redirect to `/login`.

## Error Handling

- Wrong username/password returns `401` without revealing which field was wrong.
- Missing/invalid/expired access token returns `401`.
- Missing/invalid/expired refresh token returns `401`.
- Frontend shows a simple login error message and does not expose token details.

## Testing

Backend tests:

- Login succeeds with seeded credentials.
- Login with wrong credentials returns `401`.
- Refresh succeeds after login cookie is set.
- Refresh without cookie returns `401`.
- `/api/auth/me` returns `401` without a bearer token.
- `/api/auth/me` returns username with a valid bearer token.
- A token subject that refers to a missing user returns `401`.
- Logout clears the refresh cookie.

Frontend tests are not required in Slice 1 unless a test runner is already present. The frontend must pass ESLint, TypeScript, and production build.

CI must continue passing:

- Backend Ruff lint
- Backend pytest
- Frontend ESLint
- Frontend typecheck
- Frontend build
- Docker compose validation/build

## Acceptance Criteria Mapping

- Cannot reach any protected API route without a valid JWT: verified by `/api/auth/me`.
- Login with correct credentials works; wrong credentials return `401`: verified by backend tests and manual login.
- Refreshing the page does not log the user out: frontend boot refreshes from httpOnly refresh cookie.
