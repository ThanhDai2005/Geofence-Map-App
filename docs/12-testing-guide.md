# 12 — Testing Guide

## 1. Automated tests

**Current state:** `backend/package.json` script:

```json
"test": "echo \"Error: no test specified\" && exit 1"
```

There is **no** Jest/Mocha/Supertest suite in the repository. All verification below is **manual** or **external** (Postman, curl, REST Client).

---

## 2. Environment setup for manual testing

1. Create `backend/.env` with at minimum:

   ```
   MONGO_URI=mongodb://localhost:27017/vngo_test
   JWT_SECRET=use_a_long_random_secret_for_local_testing_only
   PORT=3000
   ```

2. Start MongoDB locally or point `MONGO_URI` to a cluster.

3. **Optional seed:**

   ```bash
   cd backend
   node src/seed.js
   ```

   This **wipes** `users`, `pois`, `poirequests` in the target database.

4. Start API:

   ```bash
   node src/server.js
   ```

---

## 3. Smoke checklist (happy paths)

| # | Action | Expected |
|---|--------|----------|
| 1 | `POST /api/v1/auth/login` with seeded `admin@vngo.com` | `200`, `token`, `user.role === ADMIN` |
| 2 | `GET /api/v1/pois/nearby?lat=10.77&lng=106.70` with Bearer token | `200`, only approved (or legacy) POIs |
| 3 | `GET /api/v1/pois/code/VNM-SGN-001` with Bearer | `200` |
| 4 | `POST /api/v1/pois` as ADMIN with new code | `201`, POI visible on nearby |
| 5 | `POST /api/v1/owner/pois` as OWNER (`owner@vngo.com`) | `201`, `status: PENDING` |
| 6 | Repeat (5) same code immediately | `429` (within 10s) |
| 7 | `GET /api/v1/pois/nearby` after (5) | New **pending** POI **not** listed |
| 8 | `POST /api/v1/users/me/subscription/upgrade` | `200`, `isPremium: true` |
| 9 | `GET /api/v1/premium/advanced-poi` after (8) | `200` |
| 10 | `GET /api/v1/premium/advanced-poi` before (8) | `402` |

---

## 4. Role-based matrix

| Endpoint | USER | OWNER | ADMIN |
|----------|------|-------|-------|
| `GET /pois/nearby` | ✓ JWT | ✓ | ✓ |
| `POST /pois` | ✗ 403 | ✗ 403 | ✓ |
| `GET /owner/me` | ✗ 403 | ✓ | ✗ 403 |
| `POST /owner/pois` | ✗ 403 | ✓ | ✗ 403 |

Obtain tokens by logging in as `test@vngo.com`, `owner@vngo.com`, `admin@vngo.com` after seed.

---

## 5. Owner POI validation cases

| Body | Expected HTTP |
|------|----------------|
| Omit `name` | 400 `Name is required` |
| Omit `radius` | 400 `Radius is required` |
| `radius: 0` | 400 radius range message |
| `radius: 100001` | 400 radius range message |
| Omit `location` | 400 location lat/lng message |
| `code` already in DB | 409 |
| Valid first submit, repeat within 10s same code | 429 |
| Include `"status": "APPROVED"` | Still **PENDING** in response (verify in JSON) |

---

## 6. Auth & token edge cases

| Case | Expected |
|------|----------|
| No `Authorization` on protected route | 401 |
| `Authorization: Bearer` with garbage token | 401 |
| Valid token but user deleted from DB | 401 user no longer exists |

---

## 7. POI request edge cases

| Case | Expected |
|------|----------|
| `PUT /poi-requests/:id/status` with `status: "pending"` | 400 `Invalid status` |
| Random Mongo id | 404 |
| As USER token (not admin) | **Still 200 if id valid** — documents authorization gap |

---

## 8. Rate limit & timeout

| Case | How to simulate | Expected |
|------|-----------------|----------|
| Rate limit | Send >100 requests in 1 minute from same IP | 429 from rate limiter |
| Timeout | Mock slow handler (not in repo) or lower `REQUEST_TIMEOUT` env | 503 timeout message |

---

## 9. Cache coherence

1. `GET /pois/code/X` twice — second may be cache hit (logged `[CACHE] Hit:` in console).
2. `PUT /pois/code/X` as admin — cache cleared; subsequent get should reflect update.

---

## 10. Regression risks when changing code

- **`poi.repository` visibility filter** — wrong change leaks `PENDING` POIs to clients.
- **`createPoi` vs `createOwnerPoi`** — wrong default status breaks public visibility or moderation intent.
- **`requireRole` order** — must run after `protect` / `requireAuth`.

---

## 11. Suggested future automated tests

- Supertest against `app` with in-memory MongoDB or testcontainers.
- Contract tests for **every** endpoint in `07-api-reference.md`.
- Property test: owner submit never returns `APPROVED`.
