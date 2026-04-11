# 01 — Architecture

## 1. Layering model

The backend follows a strict **controller → service → repository** flow for domain logic.

| Layer | Allowed dependencies | Forbidden |
|-------|----------------------|-----------|
| **Routes** | Controllers, middleware | Direct DB, business rules |
| **Controllers** | Services | Repositories, Mongoose models (except none today) |
| **Services** | Repositories, models (indirectly via repo), config, utils, constants, `AppError` | Express `req`/`res` manipulation |
| **Repositories** | Mongoose models | HTTP, JWT, subscription logic |
| **Models** | Mongoose, bcrypt (User), constants for enums | Services |

**Exceptions (documented):**

- **`auth.middleware.js`** loads the **`User`** model directly to resolve `req.user` after JWT verify (acceptable cross-cutting pattern).
- **`subscription.middleware.js`** calls **`subscription.service.js`** (acceptable thin adapter).

---

## 2. Dependency flow (data plane)

```
HTTP Request
    → app.js (global middleware)
    → routes/*.routes.js (router + route middleware)
    → controllers/*.controller.js
    → services/*.service.js
    → repositories/*.repository.js
    → models/*.model.js → MongoDB
```

**Error path:** Any layer may `throw new AppError(...)` or `next(err)`; final formatting in **`error.middleware.js`**.

---

## 3. Middleware pipeline (global order)

Defined in **`backend/src/app.js`** in this **exact order**:

1. **`requestTimeout`** (`timeout.middleware.js`) — sets `setTimeout` → **`503`** `AppError` if response not finished within `config.timeout.ms`.
2. **`cors`** — origin callback; rejects with `Error('Not allowed by CORS')` (not `AppError`; may become 500 unless caught).
3. **`express.json()`** — JSON body parser.
4. **`rateLimiter`** (`rate-limit.middleware.js`) — per-IP counter; **`429`** when over limit.
5. **Anonymous logger** — `console.log` timestamp, method, `req.url`.
6. **Routers** (see §4).
7. **404 handler** — `AppError(..., 404)` for unknown routes.
8. **`errorHandler`** — JSON error body.

---

## 4. Router mounting map

| Mount path | Router file | Notes |
|------------|-------------|--------|
| `/api/v1/auth` | `routes/auth.routes.js` | Public login. |
| `/api/v1/pois` | `routes/poi.routes.js` | **All routes** use `protect`; reads + admin mutations. |
| `/api/v1/poi-requests` | `routes/poi-request.routes.js` | **All routes** use `protect`. |
| `/api/v1/users/me/subscription` | `routes/subscription.routes.js` | **All routes** use `protect`. |
| `/api/v1/owner` | `routes/owner.routes.js` | `requireAuth` + `requireRole(OWNER)`. |
| `/api/v1/premium` | `routes/premium.routes.js` | `protect` + `requirePremium`. |

---

## 5. Stateful components (process memory)

| Component | File | Behavior |
|-----------|------|----------|
| **POI read cache** | `poi.service.js` | `Cache(config.cache.ttl)` — keys for nearby + by-code; **`clear()`** on POI mutations. |
| **Owner submit dedupe** | `poi.service.js` | `Cache(10)` — 10s TTL keys `ownerSubmit:{ownerId}:{code}`. |
| **Rate limit map** | `rate-limit.middleware.js` | `Map` IP → count; **cleared entirely** every `config.rateLimit.windowMs` (not a sliding window per key). |

---

## 6. Configuration module

**`backend/src/config/index.js`** runs at `require` time:

- Exits process if `MONGO_URI` or `JWT_SECRET` missing.
- Exposes: `env`, `port`, `mongoUri`, `jwtSecret`, `jwtExpiresIn` (`'7d'`), `corsOrigin`, `rateLimit`, `cache.ttl`, `timeout.ms`.

---

## 7. Boot sequence

**`server.js`:**

1. `dotenv.config()`
2. `await connectDB()` (mongoose)
3. `app.listen(config.port)`

---

## 8. Design decisions (why)

| Decision | Rationale |
|----------|-----------|
| **RBAC separate from subscription** | Different axes: *who you are* vs *what you paid for*; composable middleware. |
| **Public POI visibility in repository** | Single place ensures nearby/detail cannot accidentally leak `PENDING`/`REJECTED` POIs. |
| **Admin POI create forces `APPROVED`** | Keeps admin-created content visible immediately without a second approval step. |
| **Owner POI uses `PENDING`** | Submissions wait for a future moderation API (not present for `Poi` today). |
| **In-memory caches** | Simple deployment; not shared across instances (documented limitation). |
