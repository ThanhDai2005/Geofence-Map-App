# 03 — Subscription & Feature Gating

## 1. Data model

**User field:** `isPremium` — `Boolean`, default **`false`** (`user.model.js`).

**Persistence:** `user.repository.updatePremiumStatus(userId, isPremium)` → `findByIdAndUpdate`.

---

## 2. Subscription service

**File:** `services/subscription.service.js` (exported singleton).

### 2.1 Methods

| Method | Behavior |
|--------|----------|
| `checkIsPremium(user)` | `false` if falsy user; else `Boolean(user.isPremium)`. |
| `requirePremium(user)` | Throws **`AppError('Premium subscription required', 402)`** if not premium. |
| `isFeatureAllowed(user, featureKey)` | See §3. |
| `canAccessFeature(user, feature)` | Alias: returns `isFeatureAllowed(user, feature)`. |
| `upgradeSubscription(userId)` | Sets `isPremium: true`; **404** if user missing. Returns `{ id, email, isPremium }`. |

### 2.2 Upgrade endpoint

- **Route:** `POST /api/v1/users/me/subscription/upgrade`
- **Middleware:** `protect` (JWT required).
- **RBAC:** None — any authenticated role may hit this route in current code.
- **Controller:** `subscription.controller.js` uses `req.user.id` (Mongoose virtual `id`).

---

## 3. Feature registry

**File:** `constants/features.js`

### 3.1 Feature keys

```javascript
FEATURES = Object.freeze({
  ADVANCED_POI: 'ADVANCED_POI',
  TRANSLATION_API: 'TRANSLATION_API'
});
```

### 3.2 Premium-gated features

`FEATURE_KEYS_REQUIRING_PREMIUM` is a `Set` containing **both** values above.

Helpers:

- `featureRequiresPremium(featureKey)` — `FEATURE_KEYS_REQUIRING_PREMIUM.has(featureKey)`
- `isKnownFeature(featureKey)` — `FEATURE_KEYS.has(featureKey)`

### 3.3 `isFeatureAllowed` logic

1. If `featureKey` missing or not a string → **`false`**.
2. If not `isKnownFeature(featureKey)` → **`false`** (unknown = deny).
3. If `!featureRequiresPremium(featureKey)` → **`true`** (extensibility hook; currently all known features require premium).
4. Else return `checkIsPremium(user)`.

---

## 4. Subscription middleware

**File:** `middlewares/subscription.middleware.js`

### `requirePremium`

| Step | Result |
|------|--------|
| No `req.user` | **401** `Not authorized to access this route` |
| `!subscriptionService.checkIsPremium(req.user)` | **402** `Premium subscription required` |
| Else | `next()` |

**Does not** call `requireRole`; **order matters:** routes mount **`protect` before `requirePremium`** so `req.user` exists.

---

## 5. Premium route (placeholder)

**Mount:** `/api/v1/premium`

**Router:** `routes/premium.routes.js`

- `router.use(protect)`
- `router.use(requirePremium)`
- `GET /advanced-poi` → `premium.controller.getAdvancedPoiPlaceholder` → `premium-placeholder.service.getAdvancedPoiPreview()`

**Response example:**

```json
{
  "success": true,
  "data": {
    "feature": "ADVANCED_POI",
    "message": "Premium placeholder — advanced POI capabilities will be exposed here."
  }
}
```

**Note:** `TRANSLATION_API` is registered in constants for future use; **no HTTP route** references it yet.

---

## 6. Separation from RBAC

| Concern | Mechanism |
|---------|-----------|
| Who is the user? | JWT + `requireAuth` |
| What role? | `requireRole` |
| Paid feature? | `isPremium` + `requirePremium` / `SubscriptionService` |

Compose stacks as: **auth → (optional) RBAC → (optional) premium → handler**.

---

## 7. Limitations (billing)

- No Stripe/webhooks/plan objects: **`upgrade`** flips boolean to **`true`** only.
- No downgrade endpoint in codebase.
- Premium state is **authoritative in DB** at request time (`req.user` loaded on each `protect`).
