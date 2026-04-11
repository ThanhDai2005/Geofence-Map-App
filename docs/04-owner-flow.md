# 04 — Owner Flow (POI Submission)

## 1. Scope

Owners (`role === OWNER`) submit **real `Poi` documents** via **`POST /api/v1/owner/pois`**. Submissions are stored with **`status: PENDING`** and **`submittedBy: owner’s ObjectId`**.

This path is **distinct** from **`PoiRequest`** (`/api/v1/poi-requests`), which uses lowercase statuses and a nested `poiData` shape.

---

## 2. Route & middleware

**File:** `routes/owner.routes.js`

| Order | Middleware |
|-------|------------|
| 1 | `requireAuth` (same implementation as `protect`) |
| 2 | `requireRole(ROLES.OWNER)` |

**Endpoint:** `POST /api/v1/owner/pois`

**Controller:** `owner.controller.submitPoi` → **`owner.service.submitPoi(user, body)`** → **`poi.service.createOwnerPoi(user, body)`**.

**Rule:** No business logic in the controller beyond delegating to the service.

---

## 3. Validation (`poi.service.validatePoiInput`)

**Invoked from** `createOwnerPoi` with `{ mode: 'owner' }` (only mode implemented).

### 3.1 Status stripping

- A shallow copy of `body` is made; **`status` is always `delete`d**.
- Owner **cannot** set `PENDING` / `APPROVED` / `REJECTED` manually; `createOwnerPoi` always writes **`POI_STATUS.PENDING`**.

### 3.2 Mode guard

- If `mode !== 'owner'` → **`AppError('Unsupported validation mode', 500)`**.

### 3.3 Field rules

| Check | Failure HTTP | Message |
|-------|----------------|---------|
| Body missing or not object | 400 | `Request body is required` |
| `code` not non-empty string | 400 | `POI code is required` |
| `name` not non-empty string | 400 | `Name is required` |
| `radius` missing / null / `''` | 400 | `Radius is required` |
| `Number(radius)` is NaN or `< 1` or `> 100000` | 400 | `Radius must be a valid number between 1 and 100000 meters` |
| Location | Uses `_buildLocationPayload(raw)` | Same errors as admin location (see below) |

**Location (`_buildLocationPayload`):**

| Failure | HTTP | Message |
|---------|------|---------|
| `body.location` missing `lat` or `lng` | 400 | `location.lat and location.lng are required` |
| Wrong types for lat/lng | 400 | `Invalid input type for coordinates` |
| `NaN` after `Number()` | 400 | `Latitude and Longitude must be valid numbers` |

**Content mapping:**

- `content.en` = trimmed `name`.
- Optional `content.vi` if `body.content.vi` is a non-empty string (trimmed).

**Note:** `radius` is **validated but not persisted** on the `Poi` document (no `radius` field on schema).

---

## 4. Duplicate POI code (global uniqueness)

After validation:

- `poiRepository.findByCode(payload.code)` **without** `publicOnly`.
- If any document exists → **`409`** `A POI with this code already exists`.

This applies regardless of `Poi.status` (pending submissions block the code).

---

## 5. Anti-spam (`checkDuplicateSubmission`)

**Mechanism:** In-memory **`Cache` with 10-second TTL** (`ownerPoiSubmissionCache` in `poi.service.js`).

**Key:** `ownerSubmit:{String(ownerId)}:{code}`

**Before create:** `checkDuplicateSubmission` — if key present → **`429`** `Please wait before submitting the same POI code again`.

**After successful `Poi.create`:** `ownerPoiSubmissionCache.set(submitKey, true)` (uses default TTL = 10s for this cache instance).

**Cleanup:** `setInterval` every 60s runs `ownerPoiSubmissionCache.cleanup()`.

**Limits:**

- Per **Node process** only (not shared across replicas).
- Lost on restart.

---

## 6. Persisted owner POI document

| Field | Value |
|-------|--------|
| `code` | Trimmed from payload |
| `location` | GeoJSON Point from validation |
| `content` | `{ en, vi? }` |
| `isPremiumOnly` | **`false`** (hardcoded) |
| `status` | **`PENDING`** |
| `submittedBy` | **`user._id`** |
| `createdAt` / `updatedAt` | Mongoose timestamps |

---

## 7. Response (`201`)

**Mapper:** `_mapOwnerSubmittedPoi(poi)`

```json
{
  "success": true,
  "data": {
    "id": "<ObjectId>",
    "code": "OWNER-CODE-001",
    "name": "English name from content.en",
    "status": "PENDING",
    "ownerId": "<ObjectId>",
    "location": { "lat": 10.77, "lng": 106.70 },
    "content": { "en": "...", "vi": "..." },
    "isPremiumOnly": false,
    "createdAt": "<ISO>",
    "updatedAt": "<ISO>"
  }
}
```

---

## 8. Side effects

- **`poiCache.clear()`** (`_invalidateCache`) runs after successful owner create so public caches do not serve stale lists.

---

## 9. Owner perspective lifecycle (text state machine)

```
[Owner submits POST /owner/pois]
        → Poi.status = PENDING
        → Visible in public nearby/detail? NO (filtered out)
        → Admin approves via Poi API? NOT IMPLEMENTED (see 05-admin-flow.md)
```

---

## 10. Example request

```http
POST /api/v1/owner/pois HTTP/1.1
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "code": "VNM-OWN-001",
  "name": "Cafe Example",
  "radius": 5000,
  "location": { "lat": 10.7769, "lng": 106.7019 },
  "content": { "vi": "Quán cà phê" }
}
```

**Intentionally ignored field:** `"status": "APPROVED"` — stripped and overwritten by `PENDING`.
