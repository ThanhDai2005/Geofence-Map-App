# 10 — Business Rules

This document consolidates **all** rules enforced in code (services, middleware, repositories, models). Items are grouped by domain.

---

## 1. Authentication & users

1. **Login** requires non-empty **string** `email` and `password`.
2. **Email** must match `/^\S+@\S+\.\S+$/`.
3. **Failed login** returns generic **401** (no distinction between unknown email and wrong password).
4. **JWT payload** contains **`id`** equal to user’s MongoDB id string.
5. **JWT expiry** is fixed at **`7d`** in application config (not environment-driven in code).
6. **`User.role`** missing in DB is treated as **`USER`** for RBAC checks and login JSON output.
7. **Password** is never returned on standard `findById`; login uses explicit `.select('+password')`.

---

## 2. RBAC

1. **`requireRole`** requires **`req.user`**; otherwise **401**.
2. Effective role = **`req.user.role ?? ROLES.USER`**.
3. **OWNER** routes (`/api/v1/owner/*`) require role **`OWNER`**.
4. **POI mutations** (`POST/PUT/DELETE` under `/api/v1/pois` for admin paths) require **`ADMIN`**.
5. **USER** may access authenticated POI **reads**, **poi-requests**, **subscription upgrade**, and **premium** (if premium).

---

## 3. Subscription & features

1. **`checkIsPremium(user)`** is false if user is falsy or `isPremium` is falsy.
2. **`upgradeSubscription`** sets **`isPremium: true`** only (no toggle off).
3. **Feature gating:** Unknown feature keys → **deny** (`isFeatureAllowed` false).
4. **Known features** (`ADVANCED_POI`, `TRANSLATION_API`) are in the premium-required set → require `isPremium` for `isFeatureAllowed` to be true.
5. **`requirePremium` middleware** returns **402** if not premium.

---

## 4. POI — public reads

1. **Nearby** and **get by code (public)** only return POIs where **`status === APPROVED`** OR **`status` field is absent**.
2. **`PENDING`** and **`REJECTED`** POIs are **excluded** from public reads.
3. **Nearby** requires **`lat`** and **`lng`** present; must be string or number; `Number()` must not be `NaN`.
4. **Nearby** uses **`radius`** from query: `parseInt(radiusStr) || 5000` (invalid non-numeric string → `NaN` → **5000**).
5. **Limit** for DB query: `Math.min(parseInt(limit) || 10, 50)`; **page** at least **1**.
6. **Get by code** uses `lang` query default **`en`**; content resolution **`content[lang] || content.en || ''`**.
7. **Results are cached** in memory (TTL `CACHE_TTL` or 60s); cache cleared on POI create/update/delete and owner create.

---

## 5. POI — admin (mutations)

1. **Create** requires non-empty **`code`** string and valid **`location`** (same rules as owner geo).
2. **Admin create** always persists **`status: APPROVED`**, **`submittedBy: null`** regardless of body.
3. **Admin create** sets **`isPremiumOnly: Boolean(body.isPremiumOnly)`**.
4. **Update** finds POI by **`code`** (any status). Updates only **`location`**, **`content`** (merge), **`isPremiumOnly`** if provided.
5. **Update** does **not** apply **`status`** from request body in code.
6. **Delete** removes by **`code`** regardless of **`status`**.

---

## 6. POI — owner submission

1. **`status` in request body is stripped**; owner cannot choose status.
2. **Persisted status** is always **`PENDING`** for this flow.
3. **`isPremiumOnly`** forced **`false`**.
4. **`submittedBy`** set to **`user._id`**.
5. **Duplicate code** anywhere in `pois` collection → **409**.
6. **Same owner + same code** resubmit within **10 seconds** → **429** (in-memory).
7. **Required fields:** `code`, `name`, `radius` (1–100000), `location.lat`, `location.lng`.
8. **`radius` is validated only** — not stored on `Poi`.
9. **`name`** drives **`content.en`**; optional **`content.vi`**.

---

## 7. POI requests (separate flow)

1. **Create** requires **`poiData.code`**, **`poiData.location.lat`**, **`poiData.location.lng`** (truthy check).
2. **Types:** `code` must be string; lat/lng string or number; `Number()` must be valid.
3. **Spreads** request body into `poiData` then **overwrites** `location` with normalized GeoJSON — **only lat/lng are structurally guaranteed**; extra keys may exist if passed.
4. **Initial status** always **`pending`**.
5. **Status update** allows only **`approved`** or **`rejected`** (lowercase).
6. **Status update does not create `Poi`**.

---

## 8. Rate limiting & timeout

1. **Global rate limit:** **100** requests per **IP** per **60 seconds** (implementation resets entire map every 60s).
2. **Per-IP key:** `req.ip` or `x-forwarded-for` or socket address.
3. **Request timeout:** **10000 ms** default; on timeout **503** `AppError` if headers not sent.

---

## 9. CORS

1. If **`CORS_ORIGIN`** is **`*`**, any origin allowed (including no `Origin` header).
2. If set to comma-separated list, **`Origin` must be in list** or request fails CORS callback.

---

## 10. Implicit / hidden behaviors

1. **Mongoose** applies **`Poi` default `status: PENDING`** if a document is inserted without `status` — **admin and seed avoid this** by setting `APPROVED` explicitly where needed.
2. **Public visibility** treats **missing `status`** as visible — supports legacy documents.
3. **`joi` package** is declared but **unused** in `src/` — validation is manual `if` checks.
4. **`Poi.REJECTED`** is valid in schema but **unused** by services.

---

## 11. Error response consistency

1. Handled operational errors use **`AppError`** with explicit **HTTP status**.
2. **`error.code`** in JSON is derived from status for a **fixed set**; others map to **`SERVER_ERROR`** even when HTTP is 503/500.
