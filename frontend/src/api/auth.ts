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

export async function login(
  username: string,
  password: string,
): Promise<TokenResponse> {
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

export async function getCurrentUser(
  accessToken: string,
): Promise<CurrentUser> {
  const response = await fetch('/api/auth/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: 'include',
  })
  return parseJson<CurrentUser>(response)
}
