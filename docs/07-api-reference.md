# 07 — API Reference

**Base URL (local default):** `http://localhost:3000`  
**API prefix:** `/api/v1`

Unless noted, **`Content-Type: application/json`** for bodies.

**Auth header (when required):** `Authorization: Bearer <JWT>`

---

## 1. Authentication

### `POST /api/v1/auth/login`

**Auth:** None.

**Request body:**

```json
{
  "email": "admin@vngo.com",
  "password": "password123"
}
```

**Success `200`:**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "67ed00000000000000000001",
      "email": "admin@vngo.com",
      "role": "ADMIN",
      "isPremium": false
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Errors:** `400` validation; `401` bad credentials (see `08-error-model.md`).

---

## 2. POIs (`/api/v1/pois`)

**Router middleware:** `protect` on **all** routes in `poi.routes.js`.

### `GET /api/v1/pois/nearby`

**Query parameters:**

| Param | Required | Notes |
|-------|----------|--------|
| `lat` | Yes | string or number |
| `lng` | Yes | string or number |
| `radius` | No | passed to repository; `parseInt` or default **5000** meters in `findNearby` |
| `limit` | No | capped to **50** in controller response metadata; service also uses min(parseInt(limit)\|\|10, 50) for query |
| `page` | No | default **1** in service |

**Success `200`:**

```json
{
  "success": true,
  "count": 2,
  "pagination": { "page": 1, "limit": 10 },
  "data": [
    {
      "id": "...",
      "code": "VNM-SGN-001",
      "location": { "lat": 10.7769, "lng": 106.7019 },
      "content": "Ben Thanh Market",
      "isPremiumOnly": false
    }
  ]
}
```

**Errors:** `400` missing/invalid lat/lng.

**Visibility:** Only **APPROVED** or legacy **no status** POIs (`poi.repository.findNearby`).

---

### `GET /api/v1/pois/code/:code`

**Query:** optional `lang` (passed to `getPoiByCode`, default `en`).

**Success `200`:**

```json
{
  "success": true,
  "data": {
    "id": "...",
    "code": "VNM-SGN-001",
    "location": { "lat": 10.7769, "lng": 106.7019 },
    "content": "Localized or English string",
    "isPremiumOnly": false
  }
}
```

**Errors:** `404` not found or not publicly visible.

---

### `POST /api/v1/pois`

**Auth:** JWT + **`requireRole(ADMIN)`**.

**Body (minimal):**

```json
{
  "code": "VNM-NEW-001",
  "location": { "lat": 16.0544, "lng": 108.2022 },
  "content": { "en": "Name EN", "vi": "Tên VI" },
  "isPremiumOnly": false
}
```

**Success `201`:** `data` = `mapPoiDto` (no `status` in JSON). Persisted with **`status: APPROVED`**, **`submittedBy: null`**.

**Errors:** `400` validation; Mongo duplicate `code` may surface as **500** if not mapped to AppError.

---

### `PUT /api/v1/pois/code/:code`

**Auth:** JWT + **`requireRole(ADMIN)`**.

**Body (all optional fields):** `location`, `content`, `isPremiumOnly`.

**Success `200`:** updated `mapPoiDto`.

**Errors:** `400` bad location; `404` POI not found.

---

### `DELETE /api/v1/pois/code/:code`

**Auth:** JWT + **`requireRole(ADMIN)`**.

**Success `200`:**

```json
{
  "success": true,
  "data": { "code": "VNM-NEW-001" }
}
```

**Errors:** `404` if code missing.

---

## 3. POI requests (`/api/v1/poi-requests`)

**Router middleware:** `protect` on all routes. **No `requireRole`.**

### `POST /api/v1/poi-requests`

**Body (required shape):** must include `code`, `location.lat`, `location.lng`; optional nested fields spread into `poiData`.

**Example:**

```json
{
  "code": "REQ-001",
  "location": { "lat": 10.77, "lng": 106.70 },
  "content": { "en": "Suggest this place" },
  "isPremiumOnly": false
}
```

**Success `201`:**

```json
{
  "success": true,
  "data": {
    "id": "...",
    "poiData": {
      "code": "REQ-001",
      "location": { "lat": 10.77, "lng": 106.70 },
      "content": { "en": "Suggest this place" },
      "isPremiumOnly": false
    },
    "status": "pending",
    "createdBy": "...",
    "createdAt": "2026-04-11T12:00:00.000Z"
  }
}
```

**Errors:** `400` invalid/missing fields or types.

---

### `PUT /api/v1/poi-requests/:id/status`

**Body:**

```json
{ "status": "approved" }
```

Allowed: **`approved`**, **`rejected`** only.

**Success `200`:**

```json
{
  "success": true,
  "data": {
    "id": "...",
    "status": "approved",
    "updatedAt": "2026-04-11T12:05:00.000Z"
  }
}
```

**Errors:** `400` invalid status; `404` request not found.

---

## 4. Subscription (`/api/v1/users/me/subscription`)

**Router middleware:** `protect`.

### `POST /api/v1/users/me/subscription/upgrade`

**Body:** none required.

**Success `200`:**

```json
{
  "success": true,
  "data": {
    "id": "...",
    "email": "test@vngo.com",
    "isPremium": true
  }
}
```

**Errors:** `404` user not found (should not happen if JWT user exists).

---

## 5. Owner (`/api/v1/owner`)

**Router middleware:** `requireAuth` + `requireRole(OWNER)`.

### `GET /api/v1/owner/me`

**Success `200`:**

```json
{
  "success": true,
  "data": {
    "id": "...",
    "email": "owner@vngo.com",
    "role": "OWNER"
  }
}
```

---

### `POST /api/v1/owner/pois`

**Body:**

```json
{
  "code": "VNM-OWN-001",
  "name": "My place",
  "radius": 5000,
  "location": { "lat": 10.7769, "lng": 106.7019 },
  "content": { "vi": "Tên" }
}
```

**Success `201`:** see `04-owner-flow.md` (includes `status: PENDING`, `ownerId`, timestamps).

**Errors:** `400` validation; `409` duplicate code; `429` anti-spam.

---

## 6. Premium placeholder (`/api/v1/premium`)

**Router middleware:** `protect` + `requirePremium`.

### `GET /api/v1/premium/advanced-poi`

**Success `200`:**

```json
{
  "success": true,
  "data": {
    "feature": "ADVANCED_POI",
    "message": "Premium placeholder — advanced POI capabilities will be exposed here."
  }
}
```

**Errors:** `401` no/invalid JWT; `402` not premium.

---

## 7. Global responses

### `404` unknown route

Any path not mounted:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Route /api/v1/unknown not found"
  }
}
```

---

## 8. Endpoint summary matrix

| Method | Path | JWT | Role | Premium |
|--------|------|-----|------|---------|
| POST | `/api/v1/auth/login` | No | — | — |
| GET | `/api/v1/pois/nearby` | Yes | Any | No |
| GET | `/api/v1/pois/code/:code` | Yes | Any | No |
| POST | `/api/v1/pois` | Yes | ADMIN | No |
| PUT | `/api/v1/pois/code/:code` | Yes | ADMIN | No |
| DELETE | `/api/v1/pois/code/:code` | Yes | ADMIN | No |
| POST | `/api/v1/poi-requests` | Yes | Any | No |
| PUT | `/api/v1/poi-requests/:id/status` | Yes | Any | No |
| POST | `/api/v1/users/me/subscription/upgrade` | Yes | Any | No |
| GET | `/api/v1/owner/me` | Yes | OWNER | No |
| POST | `/api/v1/owner/pois` | Yes | OWNER | No |
| GET | `/api/v1/premium/advanced-poi` | Yes | Any | Yes (`isPremium`) |
