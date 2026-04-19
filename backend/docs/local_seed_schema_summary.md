# Local seed — MongoDB schema summary (from `backend/src/models`)

Generated from Mongoose models in this repository.

**Collection inventory (verified from `backend/src/models/`):**

| Collection | Model |
|------------|--------|
| `users` | `User` (default plural name) |
| `pois` | `Poi` |
| `poirequests` | `PoiRequest` |
| `adminpoiaudits` | `AdminPoiAudit` |
| `uis_events_raw` | `IntelligenceEventRaw` |
| `uis_device_profiles` | `IntelligenceDeviceProfile` |
| `uis_user_profiles` | `IntelligenceUserProfile` |
| `uis_user_sessions` | `IntelligenceUserSession` |
| `uis_analytics_rollups_hourly` | `IntelligenceAnalyticsRollupHourly` |
| `uis_analytics_rollups_daily` | `IntelligenceAnalyticsRollupDaily` |
| `uis_analytics_ingestion_cursors` | `IntelligenceAnalyticsIngestionCursor` |

**`translationcaches`** — not defined in this Node backend (translation cache for POIs lives in the .NET / SQLite path in this repo, not Mongo here).

---

## `users` (Mongoose model `User`, default collection name)

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `_id` | ObjectId | auto | |
| `email` | string | yes | unique, lowercase |
| `fullName` | string | no | default `''` |
| `password` | string | yes | select: false; hashed on save |
| `role` | enum | yes | `USER` \| `OWNER` \| `ADMIN` (from `constants/roles`) |
| `isPremium` | boolean | no | default false |
| `isActive` | boolean | no | default true |
| `qrScanCount` | number | no | default 0 |
| `createdAt` / `updatedAt` | Date | auto | `timestamps: true` |

**Indexes:** unique on `email` (via `unique: true` on field).

---

## `pois` (model `Poi`)

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `code` | string | yes | unique |
| `location` | GeoJSON Point | yes | `coordinates: [lng, lat]` |
| `radius`, `priority`, `languageCode`, `name`, … | mixed | varies | see `poi.model.js` |
| `status`, `submittedBy`, … | | | |

**Indexes:** `location` 2dsphere; `{ code: 1, status: 1 }`.

---

## `poirequests` (model `PoiRequest`)

Nested `poiData`, `status`, `createdBy` (ObjectId ref User). **Index:** `poiData.location` 2dsphere.

---

## `adminpoiaudits` (model `AdminPoiAudit`)

| Field | Type | Required |
|-------|------|----------|
| `poiId`, `adminId` | ObjectId | yes |
| `action` | enum APPROVE/REJECT | yes |
| `previousStatus`, `newStatus`, `reason` | string | optional |

**Index:** `{ createdAt: -1 }`.

---

## `uis_events_raw` (model `IntelligenceEventRaw`)

| Field | Type | Required | Notes |
|-------|------|----------|--------|
| `event_id` | string | no | sparse unique with `device_id` when set |
| `correlation_id` | string | yes | |
| `user_id` | string | no | nullable guest |
| `device_id` | string | yes | |
| `auth_state` | enum | yes | `guest` \| `logged_in` \| `premium` |
| `source_system` | enum | yes | `GAK` \| `MSAL` \| `NAV` \| `ROEL` |
| `event_family` | enum | yes | `LocationEvent` \| `UserInteractionEvent` \| `NavigationEvent` \| `ObservabilityEvent` |
| `payload` | Mixed | no | default `{}` |
| `runtime_tick_utc_ticks` | number | no | |
| `runtime_sequence` | number | no | part of unique index when number |
| `contract_version` | string | no | default `v2` |
| `rbel_mapping_version` | string | yes | |
| `timestamp` | Date | yes | |
| `created_at` | Date | no | default now; used by hourly rollup |
| `ingestion_request_id` | string | no | |

**Indexes:** unique partial `(device_id, correlation_id, runtime_sequence)`; unique partial `(device_id, event_id)`; `(device_id, timestamp)`; `(correlation_id, runtime_sequence)`; `(created_at, _id)` named `ix_events_raw_created_at_id_rollup`.

**Notes:** Ingestion must respect enums; `source_system` is **not** a free string like `mobile_app`.

---

## `uis_device_profiles` (model `IntelligenceDeviceProfile`)

| Field | Type | Required |
|-------|------|----------|
| `device_id` | string | yes | unique |
| `guest_role` | string | no | default `guest` |
| `last_active_at` | Date | yes |
| `linked_user_id` | string | no | |
| `createdAt` / `updatedAt` | Date | auto | timestamps |

---

## `uis_user_profiles` (model `IntelligenceUserProfile`)

| Field | Type | Required |
|-------|------|----------|
| `user_id` | string | yes | unique (Mongo user `_id` string) |
| `device_ids` | string[] | no | |
| `role` | enum | no | `guest` \| `login` \| `premium` |
| `last_active_at` | Date | yes |
| `merged_from_user_ids` | string[] | no | |
| `createdAt` / `updatedAt` | Date | auto | |

---

## `uis_user_sessions` (model `IntelligenceUserSession`)

| Field | Type | Required |
|-------|------|----------|
| `session_id` | string | yes | unique |
| `device_id` | string | yes | |
| `user_id` | string | no | |
| `start_time` | Date | yes |
| `last_seen` | Date | yes |
| `auth_state_current` | string | yes | |
| `auth_transitions` | array of subdocs | no | `at`, `from`, `to`, `source_event_id` |
| `correlation_ids_sample` | string[] | no | |
| `createdAt` / `updatedAt` | Date | auto | |

**Index:** `{ device_id: 1, last_seen: -1 }`.

---

## `uis_analytics_rollups_hourly` (model `IntelligenceAnalyticsRollupHourly`)

| Field | Type | Required |
|-------|------|----------|
| `bucket_start` | Date | yes | UTC hour floor |
| `event_family` | enum | yes | same set as raw |
| `source_system` | enum | yes | GAK/MSAL/NAV/ROEL |
| `auth_state` | enum | yes | guest/logged_in/premium |
| `total_events` | number | yes | |
| `created_at` | Date | yes | |
| `updated_at` | Date | yes | |

**Indexes:** unique `(bucket_start, event_family, source_system, auth_state)`; `(bucket_start)`.

---

## `uis_analytics_rollups_daily` (model `IntelligenceAnalyticsRollupDaily`)

Same field shape as hourly; `bucket_start` is **UTC day** start. Same unique + `bucket_start` indexes.

---

## `uis_analytics_ingestion_cursors` (model `IntelligenceAnalyticsIngestionCursor`)

| Field | Type | Required |
|-------|------|----------|
| `_id` | string | yes | only `raw_to_hourly` \| `raw_to_daily` |
| `watermark_timestamp` | Date | yes | |
| `watermark_last_raw_id` | ObjectId | no | hourly processor tie-break |
| `updated_at` | Date | yes | |

**Notes:** `_id` is the processor key; no separate `processor_id` field.

---

## Seed script safety (local only)

- Script **aborts** unless `MONGO_URI` targets **localhost** or **127.0.0.1** (rejects `mongodb+srv` / remote hosts).
- Optional `--clear` removes only **`uis_events_raw`**, **`uis_analytics_rollups_hourly`**, **`uis_analytics_rollups_daily`**, and **resets** `uis_analytics_ingestion_cursors` so rollups can re-run (does **not** drop `uis_device_profiles` / `uis_user_profiles` / `users`).

---

## How to run

From the `backend` folder (uses `backend/.env`):

```bash
node scripts/seed-intelligence-local.js
node scripts/seed-intelligence-local.js --clear
```

Or:

```bash
npm run intelligence:seed-local
npm run intelligence:seed-local -- --clear
```

Optional: ensure rollup indexes exist first:

```bash
npm run intelligence:rollup-storage
```

### Rollups and MongoDB

Hourly and daily rollup services use **multi-document transactions**. **Standalone** `mongod` (no replica set) will reject them with an error such as `Transaction numbers are only allowed on a replica set member or mongos`. For local rollups to succeed, run MongoDB as a **single-node replica set** (for example `mongod --replSet rs0`, then `mongosh` → `rs.initiate()`), and point `MONGO_URI` at `127.0.0.1` with `replicaSet=rs0` in the connection string. The seed script still inserts raw events if rollups fail; verify hourly/daily counts after fixing the server.

---

## Sample output (abbreviated)

**Successful connect + `--clear`:**

```text
[INIT] Configuration loaded and validated successfully
[seed] connected
[seed] database name: VN-GO-TRAVEL
[seed] --clear: dropping raw + rollup collections (not profiles/users)…
[seed] --clear: ingestion cursors reset to epoch (raw_to_hourly / raw_to_daily)
[seed] created User intel-seed-u0@local.test
…
[seed] inserted 350 raw events (uis_events_raw)
[seed] running hourly rollup until idle…
[rollup-hourly] batch=1 raw=350 groups=…
[seed] hourly rollup: { batches: 1, eventsProcessed: 350, …, completed: true }
[seed] running daily rollup until idle…
[seed] VERIFY counts (entire DB, not only this run):
[seed]   uis_events_raw: 350
[seed]   uis_analytics_rollups_hourly: …
[seed]   uis_analytics_rollups_daily: …
[seed] done
```

**Standalone Mongo (no replica set) — rollups skipped with explanation:**

```text
[seed] inserted 350 raw events (uis_events_raw)
[seed] running hourly rollup until idle…
[seed] Rollup failed: MongoDB transactions are not available on this server …
[seed] VERIFY counts (entire DB, not only this run):
[seed]   uis_events_raw: 350
[seed]   uis_analytics_rollups_hourly: 0
[seed]   uis_analytics_rollups_daily: 0
```
