# 06 — POI Lifecycle & Visibility

## 1. `Poi` model states

**Constants:** `constants/poi-status.js`

```javascript
POI_STATUS = Object.freeze({
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED'
});
```

**Schema defaults** (`models/poi.model.js`):

- `status` default: **`PENDING`** (applies to documents created without explicit status).
- `submittedBy` default: **`null`**.

---

## 2. How each status is set (actual code paths)

| Status | How it gets set |
|--------|------------------|
| **APPROVED** | `poi.service.createPoi` (admin POST); explicit `status` in `seed.js`; could exist on legacy data if manually inserted. |
| **PENDING** | `poi.service.createOwnerPoi` (owner POST); also default on any `Poi.create` without status (avoid in new code). |
| **REJECTED** | **No automatic or API path** in current services. |

---

## 3. Public visibility rules

**Repository:** `repositories/poi.repository.js`  
**Filter helper:** `_publicVisibilityFilter()`

A POI is **publicly visible** if **either**:

1. `status === POI_STATUS.APPROVED`, **or**
2. `status` **field does not exist** on the document (`{ status: { $exists: false } }`).

**Why clause (2):** Backward compatibility for MongoDB documents created before `status` was added.

### 3.1 Where the filter applies

| Operation | Method | Filter |
|-----------|--------|--------|
| Nearby search | `findNearby` | `$and` of `_publicVisibilityFilter()` + `$near` on `location` |
| Get by code (public) | `findByCode(code, { publicOnly: true })` | `$and` of `{ code }` + `_publicVisibilityFilter()` |

### 3.2 Where the filter does **not** apply

| Operation | Method | Behavior |
|-----------|--------|----------|
| Get by code (internal) | `findByCode(code)` | Any status |
| Owner duplicate check | `findByCode(code)` | Any status |
| Admin update/delete | `findByCode` / `deleteByCode` | Any status |

---

## 4. Public read DTO (`mapPoiDto`)

**Used by:** `getNearbyPois`, `getPoiByCode`, admin create/update responses.

**Fields returned:**

- `id`, `code`, `location.lat/lng`, `content` (single localized string), `isPremiumOnly`

**Not exposed:** `status`, `submittedBy`, `createdAt`, `updatedAt`.

**Localization:** `content[lang] || content.en || ''` — `lang` from query on get-by-code; nearby always maps with `'en'` in service.

---

## 5. Caching interaction

**File:** `poi.service.js`

- In-memory **`poiCache`** TTL = `config.cache.ttl` (default 60s).
- Keys:
  - `nearby:{lat}:{lng}:{radius}:{limit}:{page}`
  - `poi:{code}:{lang}`
- **`_invalidateCache()`** = `poiCache.clear()` on: admin create/update/delete, owner create.

**Edge case:** If a POI transitions status in DB without going through these service methods, cache could be stale until TTL or restart.

---

## 6. Text state machine (`Poi` only)

```
                    ┌─────────────────────────────────────┐
                    │  (no API) REJECTED                  │
                    └─────────────────────────────────────┘
                                    ▲
                                    │  [not implemented]
                                    │
 [Admin POST /pois] ──► APPROVED ────┼──► publicly visible
 [Seed APPROVED]                     │
                                    │
 [Owner POST /owner/pois] ──► PENDING ──► NOT publicly visible
                                    │
                                    └──► APPROVED  [no route yet]
```

**Legacy / parallel:** `PoiRequest` uses **lowercase** `pending | approved | rejected` — separate collection; see **05-admin-flow.md**.

---

## 7. Ownership semantics

| Field | Meaning |
|-------|---------|
| `submittedBy` | Set to owner’s `ObjectId` on owner create; `null` for admin-created POIs. |
| Uniqueness | `code` is **unique** across all POIs regardless of status. |

---

## 8. Geo index

**Index:** `poiSchema.index({ location: '2dsphere' })`  
Coordinates order: **`[lng, lat]`** per GeoJSON Point.
