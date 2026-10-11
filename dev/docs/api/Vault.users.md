# Users

Prefix: `/users`. See the [overview](./Vault.api.md) for cookies, CSRF and errors.

| Method | Path                           | Auth    | Description                 |
| ------ | ------------------------------ | ------- | --------------------------- |
| GET    | `/users/tag-availability?tag=` | none    | Check whether a tag is free |
| PATCH  | `/users/me`                    | session | Update the display name     |

## GET /users/tag-availability

Query: `tag` (required). It is trimmed and lowercased, then validated: 3-20 characters, `a-z 0-9 _`, starting with a letter, and not reserved.

```
GET /users/tag-availability?tag=test_user
```

**200**

```json
{ "available": false }
```

Errors: 400 invalid format (`tag: Tag must be 3-20 characters: ...`) or reserved (`tag: This tag is reserved`).

Reserved tags include `admin`, `root`, `system`, `support`, `vault`, `api`, `auth`, `login`, `register`, `me` and a few more (see `user.constants.ts`).

This is a convenience check for the signup form. The unique index on `tag` is what actually prevents duplicates: register can still return 409 if someone takes the tag in between.

## PATCH /users/me

Requires the session cookie and `X-CSRF-Token`.

```json
{ "name": "Test User Updated" }
```

`name`: 1-100 characters, trimmed. The tag is immutable and the email can't be changed yet.

**200**

```json
{
    "user": {
        "userId": "string (uuidv7)",
        "email": "test.user@example.com",
        "tag": "test_user",
        "name": "Test User Updated",
        "isVerified": false,
        "createdAt": "2026-10-11T12:00:00.000Z"
    }
}
```

Errors: 400 validation, 401 `Authentication required`, 403 `Invalid CSRF token`, 404 `User not found`.
