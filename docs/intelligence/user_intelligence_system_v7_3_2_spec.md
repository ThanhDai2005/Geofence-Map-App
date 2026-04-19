# User Intelligence System — 7.3.2 Business Intelligence Core (LOCKED SPEC)

**Version:** 7.3.2  
**Status:** Normative. Implements production-safe BI on top of existing 7.3.0 ingestion and 7.3.1 RBEL client delivery.  
**Depends on:** [user_intelligence_system_v7_3_0_spec.md](user_intelligence_system_v7_3_0_spec.md), [../bridge/runtime_to_business_event_bridge_layer_rbel_spec.md](../bridge/runtime_to_business_event_bridge_layer_rbel_spec.md), [../bridge/rbel_client_bridge_v7_3_1.md](../bridge/rbel_client_bridge_v7_3_1.md), [../SYSTEM_CURRENT_STATE.md](../SYSTEM_CURRENT_STATE.md).

**Code reference (existing):** `backend/src/app.js` (route mounts), `backend/src/services/intelligence-events.service.js`, `backend/src/models/intelligence-*.model.js`, `backend/src/routes/intelligence.routes.js`, `backend/src/routes/intelligence-admin.routes.js`, `backend/src/middlewares/intelligence-ingest.middleware.js`, `backend/src/models/user.model.js` (`isPremium`).

---

## 1. System positioning

- **7.3.2 is not a general analytics platform.** It does not provide ad-hoc exploration, ML, prediction, streaming analytics, or third-party warehouse sync.
- **7.3.2 is:** durable telemetry ingestion (7.3.0) plus RBEL delivery from the app (7.3.1), plus **bounded** rollups, **guarded** admin queries, **identity-linked** funnel semantics, **grid-only** heatmap responses, and **read-only** admin APIs for `admin-web`.
- **Runtime 7.2 is frozen:** no changes to GAK, MSAL, RDGL, ROEL, PCSL, PCGL, NavigationService, GeofenceService, or RBEL mapping semantics in the mobile app as part of 7.3.2. Backend and admin only.

---

## 2. Data flow (end-to-end)

| Step | Component | Transport / persistence |
|------|-----------|-------------------------|
| 1 | MAUI app | 7.2 runtime (GAK, MSAL, NAV, GeofenceService) unchanged |
| 2 | ROEL | In-process telemetry; `IRuntimeTelemetry.GetRecentSnapshot` |
| 3 | RBEL client bridge | `Services/RBEL/*`, `RbelBackgroundDispatcher` → maps ROEL kinds to EventContractV2-oriented wire payloads |
| 4 | HTTP | `POST /api/v1/intelligence/events/batch` (and optional `POST /api/v1/intelligence/events/single`); `Authorization: Bearer` or `X-Api-Key` when `INTELLIGENCE_INGEST_API_KEY` is set; optional `X-Device-Id` must match each event `deviceId` when present |
| 5 | Ingestion | `intelligence-events.service.js`: validate V2 rules, insert `uis_events_raw`, update `uis_device_profiles` / `uis_user_profiles` / `uis_user_sessions` per current service |
| 6 | Identity (7.3.2) | Same request path **must** maintain `uis_identity_edges` per §6 |
| 7 | Rollup processors | Background jobs read **only** `uis_events_raw` windows via **watermark** on `created_at` + `_id` (§3); write `uis_analytics_rollups_hourly` and `uis_analytics_rollups_daily`; advance `uis_analytics_ingestion_cursors` |
| 8 | Admin APIs | `GET /api/v1/admin/intelligence/*` under **ADMIN** JWT (`protect` + `requireRole(ADMIN)`); dashboards and queries use rollups and **index-backed** raw access per §5 and §9 |
| 9 | Admin dashboard | `admin-web/` consumes admin APIs only; no direct Mongo, no ROEL |

**Inbound URL map (existing):**

- Ingest: `/api/v1/intelligence/events/batch`, `/api/v1/intelligence/events/single`
- Admin (existing + 7.3.2 extensions): mount `/api/v1/admin/intelligence`

---

## 3. Rollup architecture

### 3.1 Collections

| Collection | Purpose |
|------------|---------|
| `uis_analytics_rollups_hourly` | Near–real-time metrics; **one BSON document per** `(bucket_start, event_family, source_system, auth_state)` for UTC hour buckets |
| `uis_analytics_rollups_daily` | Same dimensional grain for UTC **calendar day** buckets (`bucket_start` = day start 00:00:00.000Z) |
| `uis_analytics_ingestion_cursors` | Per-processor watermarks for incremental, idempotent raw reads |

**Grain rule:** There is **no** single-document-per-bucket design with embedded metric maps. Totals for a time bucket are obtained by **aggregating** (e.g. `$sum` of `total_events`) over all dimension tuples in that bucket.

### 3.2 Schema: `uis_analytics_rollups_hourly`

**Cardinality:** Exactly **one** document per unique tuple `(bucket_start, event_family, source_system, auth_state)` where `bucket_start` is the UTC hour floor.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `_id` | ObjectId | yes | Primary key |
| `bucket_start` | Date | yes | UTC start of hour (minute=0, second=0, ms=0) |
| `event_family` | string | yes | `LocationEvent` \| `UserInteractionEvent` \| `NavigationEvent` \| `ObservabilityEvent` |
| `source_system` | string | yes | `GAK` \| `MSAL` \| `NAV` \| `ROEL` |
| `auth_state` | string | yes | `guest` \| `logged_in` \| `premium` |
| `total_events` | number | yes | Count of raw rows aggregated into this tuple for this bucket |
| `created_at` | Date | yes | First insert time for this document |
| `updated_at` | Date | yes | Last rollup write |

**Indexes:**

- **Unique:** `{ bucket_start: 1, event_family: 1, source_system: 1, auth_state: 1 }` — enforces grain; idempotent upserts + `$inc` on `total_events` must target this key.
- **Query:** `{ bucket_start: 1 }` — range scans for timeline and admin windows over hour buckets.

### 3.3 Schema: `uis_analytics_rollups_daily`

Same fields and same **one document per** `(bucket_start, event_family, source_system, auth_state)` rule as §3.2; `bucket_start` is the UTC **day** start (00:00:00.000Z).

**Indexes:**

- **Unique:** `{ bucket_start: 1, event_family: 1, source_system: 1, auth_state: 1 }`
- **Query:** `{ bucket_start: 1 }`

### 3.4 Schema: `uis_analytics_ingestion_cursors`

**Cardinality:** At most **two** documents in the collection. `_id` is the **only** processor key.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `_id` | string | yes | **Only** allowed values: `raw_to_hourly` \| `raw_to_daily` (no suffixes, no other strings) |
| `watermark_timestamp` | Date | yes | High-water `uis_events_raw.created_at` processed for this processor (see §3.5) |
| `watermark_last_raw_id` | ObjectId | no | When present with `watermark_timestamp`, next raw read uses `(created_at, _id)` lexicographic continuation so duplicate `created_at` values cannot be skipped |
| `updated_at` | Date | yes | Last cursor write |

**Indexes:** Primary key on `_id` only (no separate `processor_id` field).

**Write rule:** Inserts and updates **must** use `_id` ∈ { `raw_to_hourly`, `raw_to_daily` } only. Any other `_id` is invalid for 7.3.2.

### 3.5 Watermark logic (normative)

**Ordering key for raw scan:** `(created_at ascending, _id ascending)`.  
`uis_events_raw` **must** have compound index `{ created_at: 1, _id: 1 }` for rollup processors.  
Raw reads use `created_at > watermark_timestamp` when `watermark_last_raw_id` is absent; when present, use `(created_at > watermark_timestamp) OR (created_at == watermark_timestamp AND _id > watermark_last_raw_id)`.

**Per-processor document:** One row per `_id` (`raw_to_hourly` or `raw_to_daily`). Field `watermark_timestamp` is advanced **only** after a batch of raw rows has been successfully applied to rollup writes for that processor (so replays before advance stay idempotent).

**Safety lag:** Let `lag_ms` be configurable (default **120000**). Let `now` be server UTC. Each run computes an upper bound on `created_at` (e.g. `high_created_at = min(now - lag_ms, watermark_timestamp + max_window_ms)` with tunable `max_window_ms`).

**Incremental window (conceptual):** Raw documents selected with `created_at` strictly after the last committed high-water for that processor, capped by `high_created_at` and a max document count per run (e.g. **50_000**), always using **range + sort** on `(created_at, _id)` — **no** full collection scan.

**Idempotency and no double count:**

- For each raw row in the batch, processors compute dimensional `bucket_start` (hour or UTC day) from row `timestamp` (or policy-defined clock field) and `$inc` `total_events` on the tuple `(bucket_start, event_family, source_system, auth_state)` matching the raw document.
- **After** all increments for the batch commit, update the cursor’s `watermark_timestamp` and `updated_at` so the same raw row is never applied twice.
- Re-running with an unchanged watermark **must** reproduce the same increments (or no-op if duplicates were skipped by watermark).

### 3.6 Timeline (hourly buckets)

**Definition:** Timeline series query `uis_analytics_rollups_hourly` with `{ bucket_start: { $gte: from, $lte: to } }` (index `{ bucket_start: 1 }`), then aggregate with **`$sum` of `total_events`** grouped by `bucket_start` (and optionally pivot by `event_family` / `source_system` / `auth_state` via additional `$group` stages). `to - from` ≤ admin query max (§5).

---

## 4. Metrics definition (MVP only)

Rollups and admin “summary” views **must** expose **only** metrics derivable from dimensional documents (§3.2–3.3):

| Metric | Definition |
|--------|------------|
| `total_events` | Value stored on each rollup document = count of raw rows for that `(bucket_start, event_family, source_system, auth_state)` |
| `events_by_family` (derived) | For a fixed `bucket_start` window: **sum** of `total_events` over documents grouped by `event_family` |
| `events_by_auth_state` (derived) | Same, grouped by `auth_state` |
| `timeline` | Ordered list of `bucket_start` (hourly) with **sum** of `total_events` across all dimension tuples in that hour |

**Forbidden in MVP:** unique user counts from raw scans, retention, sessions-per-user aggregates, POI rankings, revenue, funnel counts **from rollups** (funnel is §7 only).

---

## 5. Query engine constraints (hard guards)

### 5.1 Global limits

| Guard | Value |
|-------|-------|
| Max time range (`timestamp` filter) | **7 days** |
| Max time range for heatmap (§9) | **24 hours** |
| Max records per response | **500** |
| Server `maxTimeMS` | **2000** ms for intelligence read queries |
| Sort allowlist | Exactly one: `timestamp` desc for device/user queries; journey sort fixed in §8 |

### 5.2 Allowed query modes (only three)

**Mode A — device timeline**

- **Required:** `device_id`, `from`, `to` (ISO 8601), `from < to`, `(to - from) ≤ 7d`
- **Query pattern:** `uis_events_raw.find({ device_id, timestamp: { $gte: from, $lte: to } }).sort({ timestamp: -1 }).limit(500)`
- **Index:** `{ device_id: 1, timestamp: -1 }` (exists on `IntelligenceEventRaw`)

**Mode B — user timeline**

- **Required:** `user_id`, `from`, `to`, same range rule
- **Query pattern:** `uis_events_raw.find({ user_id, timestamp: { $gte: from, $lte: to } }).sort({ timestamp: -1 }).limit(500)`
- **Index:** **required** `{ user_id: 1, timestamp: -1 }` partial filter `user_id: { $type: 'string', $ne: '' }` if `user_id` can be null in documents; queries **must** reject null `user_id`

**Mode C — correlation journey page**

- **Required:** `correlation_id`; optional cursor (§8)
- **Index:** `{ correlation_id: 1, runtime_sequence: 1, _id: 1 }` **required** (add `_id` to existing correlation index in model migration)

### 5.3 Forbidden queries

- No `payload` field regex or dynamic key paths from clients
- No `$where`, no arbitrary Mongo query DSL from request body
- No scans without equality on `device_id` **or** `user_id` **or** `correlation_id` as above
- No time-unbounded queries
- No `limit` above **500** from client input

### 5.4 Admin API surface (7.3.2)

New routes **must** validate mode A/B/C in code paths (fixed templates).  
`GET /api/v1/admin/intelligence/summary` **must** read aggregates **only** from `uis_analytics_rollups_hourly` and/or `uis_analytics_rollups_daily`: `$match` on `bucket_start` within `[from, to]`, then `$group` to sum `total_events` by dimension or for totals — **never** a single pre-materialized map document per bucket. Direct `$match` + `$group` on `uis_events_raw` for this endpoint **is forbidden** in production builds.

---

## 6. Identity system (required)

### 6.1 Collection: `uis_identity_edges`

**Purpose:** Canonical, append-only **links** between identifiers. **7.3.2 requires this collection**; funnel and premium truth **must not** rely on raw event ordering alone.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `_id` | ObjectId | yes | |
| `edge_type` | string | yes | MVP enum: `device_linked_user` |
| `from_id` | string | yes | `device_id` |
| `to_id` | string | yes | `user_id` (Mongo `User` `_id` string form used in raw `user_id`) |
| `established_at` | Date | yes | Server time at commit |
| `source` | string | yes | `ingest_jwt` \| `ingest_api_key` |
| `confidence` | string | yes | `high` if JWT path and `userId` matches authenticated user; `medium` only if explicitly documented policy allows |
| `ingestion_request_id` | string | no | From `uis_events_raw.ingestion_request_id` when available |

**Indexes:**

- Unique partial: `{ edge_type: 1, from_id: 1, to_id: 1 }`
- `{ to_id: 1, established_at: -1 }`
- `{ from_id: 1, established_at: -1 }`

### 6.2 Write rules (when to create an edge)

- On successful insert of a `uis_events_raw` document where `user_id` is non-null **and** request was authenticated with Bearer JWT **and** `String(ev.userId) === String(req.user._id)` (same rule as `intelligence-events.service.js` today), **upsert** `device_linked_user` edge `(from_id=device_id, to_id=user_id)` with `source=ingest_jwt`, `confidence=high`, `established_at=min(existing.established_at, event.timestamp)` on first link **or** keep earliest `established_at` unchanged on duplicate key.
- **API-key-only** ingestion without user binding **must not** create `device_linked_user` edges.

### 6.3 Profile derivation

- **`uis_device_profiles`:** `linked_user_id` **must** equal `to_id` of the earliest `device_linked_user` edge for `from_id = device_id` when such an edge exists; `last_active_at` updated from latest event as today.
- **`uis_user_profiles`:** `device_ids` **must** include every `from_id` linked by `device_linked_user` to `user_id`; `role` field **must** align with §7 (`premium_user` only when `User.isPremium` is true); event `auth_state` alone **must not** set premium for funnel or profile `role`.

---

## 7. Funnel definition (strict)

### 7.1 States (logical)

| State ID | Meaning |
|----------|---------|
| `guest_device` | `device_id` observed with **no** `device_linked_user` edge to any user |
| `identified_user` | A `device_linked_user` edge exists `(device_id → user_id)` |
| `premium_user` | `identified_user` **and** canonical `User` document has `isPremium === true` |

### 7.2 Transitions (materialized, not raw event order)

| Transition | Source of truth | Timestamp field |
|--------------|-----------------|-----------------|
| `guest_device` → `identified_user` | First `uis_identity_edges` row `edge_type=device_linked_user` for that `device_id` | `established_at` (or min rule in §6.2) |
| `identified_user` → `premium_user` | `users.isPremium` becomes true after link already exists | Read from `User` + edge join in funnel job |

**Funnel counts** for window `[from, to]`:

- Count devices entering `identified_user` when **edge** `established_at` ∈ `[from, to]`.
- Count users entering `premium_user` when **`isPremium`** became true in window **and** user has at least one `device_linked_user` edge **or** profile already lists `device_ids` (implementation uses `User` + edges).

**Explicit prohibition:** Ordering `uis_events_raw` by time and counting `auth_state` changes **must not** define funnel conversion.

---

## 8. Journey replay contract

### 8.1 Sort order (deterministic)

For fixed `correlation_id`, rows **must** be returned sorted by:

1. `runtime_sequence` ascending (nulls **not** allowed for journey membership; rows with null `runtime_sequence` **excluded** from journey API or rejected at ingest—ingest already expects RBEL to populate sequence; journey query uses only rows where `runtime_sequence` is a number)
2. `_id` ascending

**Tie-breaker:** `_id` only after `runtime_sequence`.

### 8.2 API behavior

- **Route:** `GET /api/v1/admin/intelligence/journeys/:correlationId`
- **Query:** `limit` ≤ **500**; default **500**
- **Response shape:** `{ success: true, data: { correlationId, events: [...] } }` (existing controller pattern)

### 8.3 Pagination cursor (optional extension)

- **Cursor parameters:** `cursorSequence` (number), `cursorId` (ObjectId string)
- **Semantics:** return next page where `(runtime_sequence > cursorSequence) OR (runtime_sequence == cursorSequence AND _id > cursorId)`, same sort, `limit` ≤ 500

### 8.4 Index

- `{ correlation_id: 1, runtime_sequence: 1, _id: 1 }`

---

## 9. Heatmap data strategy

### 9.1 Data source

- **Input:** `uis_events_raw` only for events where **location** is available: `event_family === 'LocationEvent'` **and** top-level or payload fields provide coordinates per existing RBEL payload conventions (`latitude` / `longitude` on wire may appear in stored `payload`; implementation **must** read only from a **fixed** allowlist of BSON paths documented in code comments, e.g. `payload.latitude`, `payload.longitude` or documented top-level fields if present).

### 9.2 Spatial aggregation

- Server **must** bucket points into a fixed grid (e.g. **0.01°** lat/lon cells) and return **only**:
  - `cell_key` (string, e.g. `"latIdx_lonIdx"`)
  - `cell_center_lat`, `cell_center_lon`
  - `weight` (integer count of events in window)
- **Response must not** include per-event coordinates, device IDs, user IDs, or correlation IDs in the heatmap payload.

### 9.3 Time constraint

- Heatmap request **must** require `from`/`to` with `(to - from) ≤ 24 hours` and enforce §5 `maxTimeMS`.

### 9.4 Index

- Query **must** be constrained by `timestamp` range **and** `event_family: 'LocationEvent'` using index `{ event_family: 1, timestamp: -1 }` **or** equivalent composite that includes `timestamp` as equality/range prefix per Mongo rules—exact index definition is implementation-defined but **must** prevent collection scan.

---

## 10. Operational guardrails

### 10.1 Rate limiting

- **Global:** Existing `rateLimiter` in `app.js` (**100** requests per IP per **60s** window from `config.rateLimit`).
- **Intelligence ingest:** **Must** remain bounded; batch max **100** events (`MAX_BATCH` in `intelligence-events.service.js`). Stricter per-route limit (e.g. **30** POSTs/min/IP for `/api/v1/intelligence/events/*`) **recommended** in addition to global limit.

### 10.2 Query timeout

- Intelligence read operations **must** set `maxTimeMS` to **2000** (§5).
- Global HTTP timeout remains `config.timeout.ms` (default **10000** ms) from `timeout.middleware.js`.

### 10.3 Rollup lag monitoring

- Expose internal metric or log line: `now - watermark_timestamp` per cursor `_id` (`raw_to_hourly` \| `raw_to_daily`) in `uis_analytics_ingestion_cursors`.
- Alert threshold (operations): lag **>** **15 minutes** sustained for `_id: raw_to_hourly`.

### 10.4 Security

- Admin intelligence routes: **ADMIN** JWT only (existing `intelligence-admin.routes.js`).
- Ingest: Bearer or `X-Api-Key` per `intelligence-ingest.middleware.js`; `userId` mismatch with JWT **must** remain **403**.

---

## 11. Non-goals (7.3.2)

- Modifying MAUI 7.2 runtime, ROEL decorators, GAK, MSAL, RBEL bridge batch sizes, or navigation behavior.
- Kafka, Redis, new external SaaS, WebSocket streaming, ML, cohort builders beyond funnel definitions above, arbitrary query languages, raw GPS export to browsers.

---

## 12. Traceability

| Artifact | Repository location |
|----------|---------------------|
| Ingest service | `backend/src/services/intelligence-events.service.js` |
| Raw / profile models | `backend/src/models/intelligence-event-raw.model.js`, `intelligence-device-profile.model.js`, `intelligence-user-profile.model.js`, `intelligence-user-session.model.js` |
| Rollup / cursor models | `backend/src/models/intelligence-analytics-rollup-hourly.model.js`, `intelligence-analytics-rollup-daily.model.js`, `intelligence-analytics-ingestion-cursor.model.js` |
| Hourly rollup processor | `backend/src/services/intelligence-rollup-hourly.service.js`, `npm run intelligence:rollup-hourly` |
| Rollup indexes (idempotent) | `backend/scripts/ensure-intelligence-rollup-storage.js`, `npm run intelligence:rollup-storage` |
| Subscription source of truth | `backend/src/models/user.model.js` → `isPremium` |
| RBEL client | MAUI `Services/RBEL/*`, `docs/bridge/rbel_client_bridge_v7_3_1.md` |

**End of locked specification.**
