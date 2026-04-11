# 00 — System Overview

This document describes the **VN-GO Travel backend** (`backend/`), a **Node.js + Express 5** API backed by **MongoDB** (via **Mongoose**). It is designed as a **JSON REST API** with **JWT authentication**, **role-based access control (RBAC)**, **subscription-based feature gating**, and **POI (Point of Interest)** management including an **owner submission** path.

---

## 1. System purpose

- **Authenticate** users and issue JWTs.
- **Authorize** actions by **role** (`USER`, `OWNER`, `ADMIN`).
- **Gate** selected routes by **premium** flag (`User.isPremium`).
- **Expose POIs** for nearby search and lookup by code, with **visibility rules** tied to `Poi.status`.
- **Allow owners** to submit new POIs that start in **`PENDING`** moderation state.
- **Allow admins** to create, update, and delete POIs via dedicated routes (admin-created POIs are stored as **`APPROVED`** immediately).
- **Support a separate legacy flow** (`PoiRequest` collection) for user-submitted requests with lowercase status values (`pending` / `approved` / `rejected`).

---

## 2. Repository layout (backend)

| Area | Path | Responsibility |
|------|------|------------------|
| Entry | `backend/src/server.js` | Loads env, connects DB, listens on `PORT`. |
| App factory | `backend/src/app.js` | Express app, global middleware, route mounting, 404, error handler. |
| Config | `backend/src/config/index.js` | Env validation, JWT/CORS/rate limit/cache/timeout settings. |
| DB | `backend/src/config/db.js` | Mongoose `connect`. |
| Routes | `backend/src/routes/*.routes.js` | HTTP path → controller binding; middleware stacks per router. |
| Controllers | `backend/src/controllers/*.controller.js` | Parse HTTP, call services, shape success JSON. |
| Services | `backend/src/services/*.service.js` | Business rules, validation orchestration, caching side effects. |
| Repositories | `backend/src/repositories/*.repository.js` | Mongoose queries only (no HTTP). |
| Models | `backend/src/models/*.model.js` | Schemas, indexes, instance methods. |
| Middleware | `backend/src/middlewares/*.middleware.js` | Cross-cutting: auth, RBAC, subscription, errors, rate limit, timeout. |
| Constants | `backend/src/constants/*.js` | Frozen enums (`ROLES`, `POI_STATUS`, `FEATURES`). |
| Utils | `backend/src/utils/cache.js` | In-memory TTL `Map` cache. |
| Seed | `backend/src/seed.js` | Dev data: users + POIs + clears `PoiRequest`. |

---

## 3. Architecture style

- **Layered**: **Route → Controller → Service → Repository → Model**.
- **Singleton services**: Most services export `module.exports = new XxxService()` so state (e.g. POI cache) is process-wide.
- **Separation of concerns**:
  - **RBAC** (`requireRole`) answers: *is this role allowed on this route?*
  - **Subscription** (`requirePremium`, `SubscriptionService`) answers: *does this user have premium for this feature/route?*
  - **POI visibility** is enforced in **`PoiRepository`** for public reads (`publicOnly` / nearby filter), not in controllers.

---

## 4. Request lifecycle (high level)

1. **Request** hits Express.
2. **`requestTimeout`** starts a timer; on expiry, may respond with **503** (`AppError`) if headers not sent.
3. **CORS** validates `Origin` against `CORS_ORIGIN` (or allows all if `*`).
4. **`express.json()`** parses JSON body.
5. **`rateLimiter`** counts requests per IP in an in-memory `Map` (cleared every window).
6. **Request logger** logs method + `req.url`.
7. **Router** matches path under `/api/v1/...`.
8. **Route-level middleware** may run: `protect` / `requireAuth`, `requireRole`, `requirePremium`.
9. **Controller** invokes **service**.
10. **Service** uses **repository** and **models**; may throw **`AppError`**.
11. On unhandled route: **404** `AppError`.
12. **`errorHandler`** formats JSON `{ error: { code, message } }` and HTTP status.

---

## 5. Environment variables

| Variable | Required | Default / behavior |
|----------|----------|---------------------|
| `MONGO_URI` | Yes | MongoDB connection string. Missing → process exit on config load. |
| `JWT_SECRET` | Yes | HMAC secret for JWT. Missing → process exit. |
| `PORT` | No | `3000` |
| `NODE_ENV` | No | `development` (logged only) |
| `CORS_ORIGIN` | No | `*` (allow all origins) |
| `CACHE_TTL` | No | POI cache TTL seconds, default `60` |
| `REQUEST_TIMEOUT` | No | Request timeout ms, default `10000` |

---

## 6. Dependencies (runtime)

Declared in `backend/package.json`: `express`, `mongoose`, `jsonwebtoken`, `bcryptjs`, `cors`, `dotenv`, `joi` (listed but **not referenced** under `backend/src/` as of this documentation pass).

---

## 7. Known product gaps (accurate to code)

- There is **no** dedicated **ADMIN** HTTP endpoint that transitions a **`Poi`** from **`PENDING`** (owner submission) to **`APPROVED`** or **`REJECTED`**. **`Poi.REJECTED`** exists in the schema but **no service method** sets it.
- **`PUT /api/v1/poi-requests/:id/status`** updates **`PoiRequest`** documents and is **not** restricted to `ADMIN` in routes (any authenticated user can call it if they know the id).

These are implementation facts, not future intentions; see **05-admin-flow.md** and **11-security-model.md**.

---

## 8. Cross-references

| Topic | Document |
|-------|-----------|
| Layers & middleware order | `01-architecture.md` |
| JWT & roles | `02-auth-rbac.md` |
| Premium & features | `03-subscription.md` |
| Owner POI POST | `04-owner-flow.md` |
| Admin POI & moderation reality | `05-admin-flow.md` |
| Poi status & visibility | `06-poi-lifecycle.md` |
| Endpoint catalog | `07-api-reference.md` |
| Errors | `08-error-model.md` |
| Schemas | `09-data-model.md` |
| Rules compendium | `10-business-rules.md` |
| Threats & access | `11-security-model.md` |
| How to test | `12-testing-guide.md` |
| How to extend | `13-developer-playbook.md` |
