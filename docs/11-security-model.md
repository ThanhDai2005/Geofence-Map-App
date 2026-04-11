# 11 — Security Model

## 1. Threat model assumptions

- API is exposed over HTTPS in production **outside** this repository (not configured here).
- MongoDB credentials live in **`MONGO_URI`**; must be protected like any secret.
- **`JWT_SECRET`** must be strong; compromise allows token forgery.

---

## 2. Authentication security

| Control | Implementation |
|---------|----------------|
| Password hashing | bcrypt, cost **12**, on `User` save when password modified. |
| Password exposure | `select: false`; only login query adds `+password`. |
| Token format | Bearer JWT; HS256 (default `jsonwebtoken` algorithm). |
| Token lifetime | **7 days** fixed in config. |
| Logout / revoke | **Not implemented** — tokens valid until expiry. |

---

## 3. RBAC security

| Control | Implementation |
|---------|----------------|
| Role enforcement | `requireRole` after authentication. |
| Default role | Missing `role` in DB → treated as **USER** (fail-closed for ADMIN routes). |
| Admin POI writes | **ADMIN** only on `POST/PUT/DELETE` `/api/v1/pois` mutation routes. |
| Owner routes | **OWNER** only on `/api/v1/owner/*`. |

**Gap:** **`PUT /api/v1/poi-requests/:id/status`** is only behind **`protect`** — **any authenticated user** may change **any** request’s status if they know **`id`**. This is an **authorization gap** relative to typical moderation expectations.

---

## 4. Subscription security

| Control | Implementation |
|---------|----------------|
| Premium check | `subscriptionService.checkIsPremium(req.user)` — DB-backed flag. |
| HTTP signal | **402** for premium middleware denial. |
| Separation | Subscription middleware does **not** embed role checks. |

**Gap:** **`POST .../subscription/upgrade`** allows **any** authenticated user to set **`isPremium: true`** — there is **no payment verification**.

---

## 5. Injection & validation

### 5.1 NoSQL / object injection

- **`poi-request.service.js`** explicitly validates **types** of `code`, `lat`, `lng` before building stored objects — reduces risk of operator injection via object-shaped inputs.
- POI services use **explicit field extraction** rather than passing raw `req.body` into Mongo operators.

### 5.2 JSON body limits

- Default **`express.json()`** limits apply (not customized in `app.js`).

---

## 6. Network & transport

| Control | Notes |
|---------|--------|
| CORS | Restrictive when `CORS_ORIGIN` is a list; permissive when `*`. |
| Rate limit | Per-IP counter; not authenticated-user based. |
| Timeout | Aborts slow handlers with **503**. |

---

## 7. Information disclosure

| Topic | Behavior |
|-------|----------|
| Login errors | Same message for bad email vs bad password (**401**). |
| JWT errors | Verification errors may surface **`jwt` library message** wrapped in **401** (could hint expiry vs malformed — minor info leak). |
| Stack traces | Logged server-side only; **not** sent in JSON responses. |
| POI pending data | **Not** returned on public POI endpoints (filtered in repository). |

---

## 8. Access control matrix (summary)

| Resource | USER | OWNER | ADMIN |
|----------|------|-------|-------|
| Login | Yes | Yes | Yes |
| POI read (nearby/detail) | JWT required | JWT required | JWT required |
| POI admin CRUD | No | No | Yes |
| Owner profile + submit POI | No | Yes | No* |

\*Unless the same account had `ADMIN` role (schema allows one role only — so **no**).

| Resource | Authenticated non-admin |
|----------|---------------------------|
| `PoiRequest` status update | **Yes (gap)** |
| Subscription upgrade | **Yes** |

---

## 9. Operational security notes

- **In-memory** rate limit and caches **do not sync** across multiple server instances.
- **Owner anti-spam** cache is **per process** — restart clears cooldown.
- **Seed script** deletes all users/POIs/requests — **never run against production** unintentionally.

---

## 10. Alignment with product stages

- **Stage 1 (RBAC):** Implemented as documented in `02-auth-rbac.md`.
- **Stage 2 (Subscription):** Flag + middleware + service; **no billing**.
- **Stage 3 (Owner POI):** Submission + **PENDING**; **admin approval of `Poi` not implemented** — see `05-admin-flow.md`.
