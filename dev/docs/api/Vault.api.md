# Vault API

Base URL (local): `http://127.0.0.1:3300/api/v1`
Health check: `GET http://127.0.0.1:3300/api/health`

If your routes are mounted under a different prefix, change `apiBase` in the Postman environment.

- [Auth endpoints](./Vault.auth.md)
- [Users endpoints](./Vault.users.md)

## Authentication model

Cookie-based server-side sessions, stored only in Redis. There are no JWTs and no refresh tokens.

| Piece | Details |
|---|---|
| Session cookie | `sid` in dev, `__Host-sid` in production. Signed, `HttpOnly`, `SameSite=Strict`, `Secure` in production. The value is an opaque random ID. |
| Lifetime | Fixed and absolute. **Short** session: 1 day. **Long** session (`remember: true`): 28 days. Never extended, and a rotated session keeps its original expiry. |
| CSRF token | Returned in the body of register, login, reauth, change-password and `GET /auth/me` as `csrfToken`. It is `HMAC(CSRF_TOKEN_SECRET, sessionId)`, so it changes whenever the session ID rotates. |
| CSRF header | Send `X-CSRF-Token: <csrfToken>` on every `POST`, `PUT`, `PATCH` and `DELETE`. It is only checked when a session cookie is present. |
| Step-up | Sensitive routes (such as signing, later) require the password to have been entered within the last 15 minutes. Otherwise the API returns 403 `Re-authentication required`: call `POST /auth/reauth`, then retry. |
| Concurrent sessions | Capped per user (`MAX_CONCURRENT_SESSIONS_PER_USER`); the oldest session is evicted when the cap is reached. |
| Suspicious sessions | If the browser family or OS of a session changes, it is flagged and treated as needing step-up until `POST /auth/reauth`. |

## Errors

Errors are thrown as `CustomError(message, httpStatus)` and rendered by the global `ErrorHandler`.

| Status | Message | When |
|---|---|---|
| 400 | `field: reason; field: reason` | Request validation failed |
| 401 | `Authentication required` | No valid session |
| 401 | `Invalid credentials` | Login failed (same message for unknown user and wrong password) |
| 401 | `Incorrect password` | Wrong password on reauth or change-password |
| 403 | `Invalid CSRF token` | Missing or wrong `X-CSRF-Token` on a state-changing request with a session |
| 403 | `Re-authentication required` | Step-up needed |
| 404 | `Session not found` / `User not found` | Unknown session ref / user |
| 409 | `Email already registered` / `Tag already taken` | Duplicate on register |
| 503 | `Session service unavailable` | Redis is unreachable |

A 401 from `reauth` or `change-password` (wrong password) does not mean the session expired. Only treat 401 `Authentication required` as "log in again".

## Postman

Files are in `postman/`.

1. Import `Vault.postman_collection.json` and `Vault - Local.postman_environment.json`.
2. Select the **Vault - Local** environment (top right).
3. Run **Auth > Register** once, then **Auth > Login (tag)** (or any later request).

Requests use fixed data. Nothing is generated.

| Item | Value |
|---|---|
| Name | `Test User` |
| Tag | `test_user` |
| Email | `test.user@example.com` |
| Password | `Test@1234` |
| Password used by Change Password | `Vault@5678` (run **Change Password (revert)** to restore) |

**Environment variables**

| Variable | Purpose |
|---|---|
| `baseUrl` | Server root, used by the health check |
| `apiBase` | `baseUrl` plus the API prefix, used by every other request |
| `csrfToken` | Filled by the collection script from any response that contains one; sent as `X-CSRF-Token` |
| `userId` | Filled from any response that contains `user.userId` |
| `sessionRef` | Filled by **List Sessions**; used by **Revoke Session** |

**Scripts**

- Collection pre-request: logs a console warning when a state-changing request has no `csrfToken`.
- Collection post-response: saves `csrfToken` and `userId` from every JSON response.
- **List Sessions** post-response: saves `sessionRef`.
- **Logout**, **Logout All** and **Revoke Session** post-response: reset `csrfToken`, `userId` and `sessionRef`, and clear the cookie jar for the host.

**Cookies:** Postman's cookie jar stores the `Set-Cookie` session cookie from the response and sends it with later requests to the same host, so no script handles the cookie itself. If a request behaves as if you are logged out, check the jar under **Cookies** (below the Send button) for `sid` on `127.0.0.1`.

**Run order:** the requests are meant to be run one by one. Register once (a second run returns 409), log in, then use the rest. **Revoke Session** ends the current session (Postman keeps a single cookie per host), so log in again afterwards.