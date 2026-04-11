# 02 — Authentication & RBAC

## 1. Authentication mechanism

### 1.1 Credential login

- **Endpoint:** `POST /api/v1/auth/login`
- **Body:** `{ "email": string, "password": string }`
- **Implementation:** `auth.controller.js` → `auth.service.js` → `user.repository.js`

### 1.2 Password storage (`User` model)

- Field `password`: `select: false` by default.
- On `save`, if password modified: **bcrypt** hash with **cost 12** (`user.model.js` `pre('save')`).
- Login uses `User.findOne({ email }).select('+password')` then `user.comparePassword(candidate, user.password)`.

### 1.3 JWT issuance

- **Library:** `jsonwebtoken`
- **Payload:** `{ id }` where `id` is the user’s MongoDB `_id` (see `auth.service.js` `signToken(user._id)` — serialized to string in JWT).
- **Secret:** `config.jwtSecret` (`JWT_SECRET` env).
- **Expiry:** `config.jwtExpiresIn` — hardcoded **`'7d'`** in `config/index.js` (not env-overridable in code).

### 1.4 Login response shape (success)

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "<ObjectId>",
      "email": "user@example.com",
      "role": "USER",
      "isPremium": false
    },
    "token": "<JWT>"
  }
}
```

- **`role`:** `user.role ?? ROLES.USER` (legacy DB docs without `role` treated as `USER` in JSON).
- **`isPremium`:** boolean from document.

### 1.5 Login validation rules (`auth.service.js`)

| Rule | HTTP | Message |
|------|------|---------|
| Missing email or password | 400 | `Please provide email and password` |
| Non-string email/password | 400 | `Email and password must be strings` |
| Email fails `/^\S+@\S+\.\S+$/` | 400 | `Invalid email format` |
| User not found or password mismatch | 401 | `Incorrect email or password` |

---

## 2. Authenticated requests (`requireAuth` / `protect`)

**File:** `middlewares/auth.middleware.js`

- **`requireAuth`** and **`protect`** are the **same function** (`const protect = requireAuth`).

### 2.1 Header format

- Expects: `Authorization: Bearer <token>`
- If header missing or not starting with `Bearer` → token undefined → **401** `Not authorized to access this route`.

### 2.2 Verification

- `jwt.verify(token, config.jwtSecret)`
- On any failure, catch block → **401** with `err.message` or `'Not authorized'`.

### 2.3 User resolution

- `User.findById(decoded.id)` (full document, no password field in normal query).
- If no user: **401** `The user belonging to this token does no longer exist.`

### 2.4 Request mutation

- Sets **`req.user`** to the Mongoose user document.

---

## 3. RBAC (`requireRole`)

**File:** `middlewares/rbac.middleware.js`

### 3.1 Role constants

**File:** `constants/roles.js`

```javascript
ROLES = Object.freeze({
  USER: 'USER',
  OWNER: 'OWNER',
  ADMIN: 'ADMIN'
});
```

**User model** enum: `Object.values(ROLES)`, default `ROLES.USER`.

### 3.2 Middleware factory

```javascript
requireRole(...allowedRoles) => (req, res, next) => { ... }
```

| Condition | HTTP | Message |
|-----------|------|---------|
| `!req.user` | 401 | `Not authorized to access this route` |
| `(req.user.role ?? ROLES.USER)` not in `allowedRoles` | 403 | `You do not have permission to perform this action` |

**Important:** Undefined `role` on old documents is treated as **`USER`** for authorization checks.

### 3.3 Where `requireRole` is used

| Location | Roles |
|----------|--------|
| `routes/owner.routes.js` | `OWNER` (router-level, all `/api/v1/owner/*`) |
| `routes/poi.routes.js` | `ADMIN` for `POST /`, `PUT /code/:code`, `DELETE /code/:code` |

**Not used on:** `poi-request`, `subscription`, `premium` (only auth and/or premium).

---

## 4. Security rules (auth + RBAC)

- JWT is **stateless**: revoking access before expiry is **not implemented** (no token blocklist).
- Password never returned on normal user fetch; only login path selects password.
- **USER** role cannot call **ADMIN** POI mutation routes (403).
- **OWNER** cannot call **ADMIN** routes unless they also hold **ADMIN** (single role per user in schema).

---

## 5. Text flow diagram (RBAC on POI admin)

```
Client + Bearer JWT
    → protect (requireAuth)
    → requireRole(ADMIN)
    → poiController.create | updateByCode | deleteByCode
```

If `protect` fails → **401**. If role not ADMIN → **403**.
