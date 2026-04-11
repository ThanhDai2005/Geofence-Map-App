# 05 — Admin Flow

## 1. What “admin” means in this codebase

- **Role:** `ADMIN` (`constants/roles.js`).
- **Enforcement:** `requireRole(ROLES.ADMIN)` on specific **`/api/v1/pois`** mutations only.

There is **no** separate `/api/v1/admin` router. Admin capabilities are **POI CRUD** on the main POI resource.

---

## 2. Admin POI endpoints

**Router:** `routes/poi.routes.js`  
**Base path:** `/api/v1/pois`  
**All routes** use **`protect`** first.

| Method | Path | Middleware after `protect` | Controller | Service |
|--------|------|------------------------------|------------|---------|
| POST | `/` | `requireRole(ADMIN)` | `poi.controller.create` | `poi.service.createPoi` |
| PUT | `/code/:code` | `requireRole(ADMIN)` | `poi.controller.updateByCode` | `poi.service.updatePoiByCode` |
| DELETE | `/code/:code` | `requireRole(ADMIN)` | `poi.controller.deleteByCode` | `poi.service.deletePoiByCode` |

**Reads** (`GET /nearby`, `GET /code/:code`) require JWT but **not** ADMIN.

---

## 3. Admin create behavior (`createPoi`)

**File:** `poi.service.js`

- Validates `code` (non-empty string) and location via `_buildLocationPayload`.
- Writes document with:
  - `status: POI_STATUS.APPROVED`
  - `submittedBy: null`
  - `content: body.content || {}`
  - `isPremiumOnly: Boolean(body.isPremiumOnly)`

**Effect:** Admin-created POIs are **immediately public** (match `publicVisibilityFilter`).

**Response:** Same public DTO as reads: `mapPoiDto` — **does not include** `status`, `submittedBy`, or timestamps in JSON.

```json
{
  "success": true,
  "data": {
    "id": "...",
    "code": "X",
    "location": { "lat": 0, "lng": 0 },
    "content": "...",
    "isPremiumOnly": false
  }
}
```

---

## 4. Admin update behavior (`updatePoiByCode`)

- Loads existing with `findByCode(code)` **without** `publicOnly` (finds any status).
- **Updatable fields from body:**
  - `location` → recomputed GeoJSON if present
  - `content` → shallow merge with existing (`toObject` if subdocument)
  - `isPremiumOnly` if defined
- **`status` is not read from `body`** in this method — admin **cannot** approve a `PENDING` owner POI via this update path in current code.

---

## 5. Admin delete behavior (`deletePoiByCode`)

- `findOneAndDelete({ code })` — removes **any** POI with that code regardless of status.
- Invalidates POI cache.

---

## 6. Owner-submitted POI moderation (gap)

**Required honesty for implementers:**

- **`Poi.status`** supports `PENDING`, `APPROVED`, `REJECTED`.
- **Owner** creates `PENDING` via `POST /api/v1/owner/pois`.
- **There is no implemented HTTP flow** that sets `Poi.status` from `PENDING` → `APPROVED` or `REJECTED` for moderation.
- **`Poi.REJECTED`** is a valid enum value but **no service or route** assigns it.

**Planned future work (not in repo):** dedicated admin moderation endpoints or extending `updatePoiByCode` to accept `status` under strict rules.

---

## 7. `PoiRequest` “approval” (separate subsystem)

**Not the same model as `Poi`.**

| Item | Detail |
|------|--------|
| Collection | `PoiRequest` |
| Create | `POST /api/v1/poi-requests` (any authenticated user) |
| Status update | `PUT /api/v1/poi-requests/:id/status` |
| Body | `{ "status": "approved" \| "rejected" }` (lowercase strings) |
| Service validation | `poi-request.service.js` — only allows those two values |
| RBAC | **None** — only `protect` |

**Important:** Updating `PoiRequest` status **does not** create or update a **`Poi`** document in the current codebase.

---

## 8. Summary table

| Action | Implemented? | Notes |
|--------|----------------|-------|
| Admin create live POI | Yes | Forces `APPROVED`. |
| Admin update POI fields | Yes | No `status` in update. |
| Admin delete POI | Yes | By `code`. |
| Admin approve owner `Poi` (`PENDING`→`APPROVED`) | **No** | — |
| Admin reject owner `Poi` | **No** | Enum exists only. |
| Moderate `PoiRequest` | Partial | Endpoint exists; **not admin-only**. |
