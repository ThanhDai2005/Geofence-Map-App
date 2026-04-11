# 13 — Developer Playbook

## 1. How to run locally

```bash
cd backend
cp .env.example .env   # if present; else create .env manually
# Set MONGO_URI, JWT_SECRET
node src/server.js
```

Seed (destructive):

```bash
node src/seed.js
```

---

## 2. Conventions (match existing code)

| Topic | Convention |
|-------|------------|
| Modules | CommonJS `require` / `module.exports`. |
| Async | `async`/`await` in controllers and services. |
| Errors | Throw or `next(new AppError(message, statusCode))`. |
| Services | Export singleton instance: `module.exports = new MyService()`. |
| Repositories | Export singleton instance. |
| Constants | `Object.freeze` for enums in `constants/`. |
| IDs | Prefer `user._id` in services; Mongoose `id` virtual exists for JWT-related DTOs. |

---

## 3. Adding a new authenticated route

1. **Choose router** under `routes/` or create `routes/feature.routes.js`.
2. **Mount** in `app.js` with full `/api/v1/...` prefix.
3. **Stack middleware** in this order when multiple apply:
   - `protect` or `requireAuth` (identical)
   - `requireRole(...)` if role-bound
   - `requirePremium` if subscription-bound
4. **Controller** only: extract `req` data, call **one** service method, return JSON.
5. **Service** implements rules; **repository** runs queries.

---

## 4. Adding a new role check

1. If it is a **new role value**, update **`constants/roles.js`** and **`user.model.js`** enum array via `Object.values(ROLES)`.
2. Use **`requireRole(ROLES.NEW_ROLE)`** on routes — do not branch on `req.user.role` in controllers for authorization.

---

## 5. Adding subscription-gated functionality

1. Register a **`FEATURES`** key in `constants/features.js`.
2. Decide if premium is required: add/remove from **`FEATURE_KEYS_REQUIRING_PREMIUM`**.
3. In HTTP layer: reuse **`requirePremium`** or compose **`SubscriptionService.isFeatureAllowed`** inside a **service** (not controller).
4. Reuse **`402`** for “payment required” consistency.

---

## 6. Extending POI lifecycle (approve/reject)

**Current gap:** No API updates **`Poi.status`** from **`PENDING`**.

**Safe extension pattern:**

1. Add **`PATCH /api/v1/pois/code/:code/status`** (example) with **`requireRole(ADMIN)`**.
2. **Service method** validates transitions, e.g. only `PENDING` → `APPROVED` | `REJECTED`.
3. Call **`_invalidateCache()`** after write.
4. **Do not** bypass **`publicVisibilityFilter`** in `findNearby` / public `findByCode`.

---

## 7. How not to break architecture

| Do | Don’t |
|----|--------|
| Put validation in **services** | Validate only in controllers |
| Keep Mongo queries in **repositories** | Call `Model.find` from controllers |
| Use **`AppError`** for expected failures | Return ad-hoc `{ error: 'x' }` shapes |
| Invalidate **`poiCache`** on POI mutations | Forget cache after direct DB edits |
| Document new env vars in **`config/index.js`** | Read `process.env` scattered in random files |

---

## 8. Files you should rarely touch

| File | Reason |
|------|--------|
| `middlewares/rbac.middleware.js` | Stable RBAC contract across product stages. |
| `middlewares/subscription.middleware.js` | Stable premium gate. |
| `error.middleware.js` | Changing `error.code` mapping affects all API clients. |

Touch them only with **API changelog** discipline.

---

## 9. Performance & scaling caveats

- **In-memory cache** and **rate limit** are **single-instance**. For horizontal scale, replace with Redis or similar.
- **`ownerPoiSubmissionCache`** is also per-instance.

---

## 10. Dependency hygiene

- **`joi`** is unused in `src/` — remove from `package.json` or start using it consistently (pick one).
- Keep **`express`**, **`mongoose`**, **`jsonwebtoken`**, **`bcryptjs`** versions aligned with security advisories.

---

## 11. Documentation maintenance

When you change behavior:

1. Update **`07-api-reference.md`** if routes or bodies change.
2. Update **`10-business-rules.md`** if logic changes.
3. Update **`05-admin-flow.md`** / **`06-poi-lifecycle.md`** if **`Poi.status`** transitions change.
4. Update **`11-security-model.md`** if authorization changes.

---

## 12. Quick file finder

| Task | Start here |
|------|------------|
| New public endpoint | `app.js`, `routes/`, `controllers/`, `services/` |
| New POI rule | `services/poi.service.js`, `repositories/poi.repository.js` |
| Auth bug | `middlewares/auth.middleware.js`, `services/auth.service.js` |
| Premium bug | `services/subscription.service.js`, `middlewares/subscription.middleware.js` |
| Schema change | `models/*.model.js`, then `09-data-model.md` |
