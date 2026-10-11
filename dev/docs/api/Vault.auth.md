# Auth

Prefix: `/auth`. See the [overview](./Vault.api.md) for cookies, CSRF and errors.

`PublicUser`:

```json
{
    "userId": "string (uuidv7)",
    "email": "test.user@example.com",
    "tag": "test_user",
    "name": "Test User",
    "isVerified": false,
    "createdAt": "2026-10-11T12:00:00.000Z"
}
```

## Summary

| Method | Path                    | Auth    | Description                                   |
| ------ | ----------------------- | ------- | --------------------------------------------- |
| POST   | `/auth/register`        | none    | Create the account and log in (short session) |
| POST   | `/auth/login`           | none    | Log in with tag or email                      |
| POST   | `/auth/logout`          | none    | Destroy the current session (idempotent)      |
| POST   | `/auth/logout-all`      | session | Destroy all sessions of the user              |
| POST   | `/auth/reauth`          | session | Step-up: confirm the password                 |
| POST   | `/auth/change-password` | session | Change the password                           |
| GET    | `/auth/me`              | session | Current user and a fresh CSRF token           |
| GET    | `/auth/sessions`        | session | List the user's active sessions               |
| DELETE | `/auth/sessions/:ref`   | session | Revoke one session                            |

"session" means the session cookie, plus `X-CSRF-Token` on non-GET requests.

## POST /auth/register

Always creates a **short** (1 day) session. The session cookie is set on the response.

```json
{
    "name": "Test User",
    "tag": "test_user",
    "email": "test.user@example.com",
    "password": "Test@1234"
}
```

| Field      | Rules                                                                                                           |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| `name`     | Required, 1-100 characters, trimmed                                                                             |
| `tag`      | 3-20 characters, `a-z 0-9 _`, starts with a letter, lowercased, not reserved. Immutable. Also usable to log in. |
| `email`    | Valid email, max 254, lowercased                                                                                |
| `password` | 8-128 characters with at least one letter, one number and one special character. Case is not enforced.          |

**201**

```json
{ "user": { "...": "PublicUser" }, "csrfToken": "string" }
```

Errors: 400 validation, 409 `Email already registered` or `Tag already taken`.

## POST /auth/login

```json
{
    "identifier": "test_user",
    "password": "Test@1234",
    "remember": false
}
```

- `identifier` is an email if it contains `@`, otherwise a tag.
- `remember` is optional (default `false`): `false` gives a 1 day session, `true` gives 28 days.
- If a session cookie is already present, that old session is destroyed.

**200** `{ "user": PublicUser, "csrfToken": "string" }`, session cookie set.
Errors: 400 validation, 401 `Invalid credentials`.

## POST /auth/logout

No body. Always **204**, with or without a session; the cookie is cleared.

## POST /auth/logout-all

No body. Destroys every session of the user, including the current one. **204**, cookie cleared.

## POST /auth/reauth

```json
{ "password": "Test@1234" }
```

Rotates the session ID (same expiry), refreshes `authenticatedAt`, clears the suspicious flag and adopts the current IP and user agent.

**200** `{ "csrfToken": "string" }` and a new session cookie.
Errors: 401 `Incorrect password`, 401 `Authentication required`.

## POST /auth/change-password

```json
{
    "currentPassword": "Test@1234",
    "newPassword": "Vault@5678"
}
```

`newPassword` follows the same rules as register and must differ from `currentPassword`. All other sessions are destroyed and the current one is rotated.

**200** `{ "csrfToken": "string" }` and a new session cookie.
Errors: 400 validation, 401 `Incorrect password`.

## GET /auth/me

**200** `{ "user": PublicUser, "csrfToken": "string" }`

Use it on page load: it gives the frontend both the user and a CSRF token. Error: 401 `Authentication required`.

## GET /auth/sessions

**200**

```json
{
    "sessions": [
        {
            "ref": "22-char opaque reference",
            "createdAt": 1791700000000,
            "expiresAt": 1791786400000,
            "remember": false,
            "ip": "127.0.0.1",
            "userAgent": "PostmanRuntime/7.x",
            "suspicious": false,
            "current": true
        }
    ]
}
```

Newest first. Timestamps are epoch milliseconds. The raw session ID is never returned.

## DELETE /auth/sessions/:ref

Revokes one of the caller's own sessions. If it is the current one, the cookie is cleared too.

**204**. Errors: 400 invalid `ref` format, 404 `Session not found`.
