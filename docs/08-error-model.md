# 08 — Error Model

## 1. `AppError` class

**File:** `middlewares/error.middleware.js`

```javascript
class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
    }
}
```

- **Throwing:** `throw new AppError('Human message', 4xx)` from services/middleware.
- **Passing to Express:** `next(new AppError(...))` or `next(err)` from async controllers.

---

## 2. Global error handler

**Function:** `errorHandler(err, req, res, next)`

### 2.1 Logging

- Always `console.error` with ISO timestamp and **`err.stack`**.

### 2.2 HTTP status

- `statusCode = err.statusCode || 500`

### 2.3 Response message

- If `err.statusCode` is truthy: **`err.message`** is sent to client.
- If not (typical non-`AppError` throw): message is **`'Internal Server Error'`** (status still 500).

### 2.4 JSON shape

```json
{
  "error": {
    "code": "<STRING_CODE>",
    "message": "<string>"
  }
}
```

---

## 3. `error.code` mapping (implemented branches)

| HTTP | `error.code` |
|------|----------------|
| 400 | `BAD_REQUEST` |
| 401 | `UNAUTHORIZED` |
| 402 | `PAYMENT_REQUIRED` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` |
| 429 | `TOO_MANY_REQUESTS` |
| *any other* | **`SERVER_ERROR`** |

**Important:** Statuses **402**, **403**, **404**, etc. always get the correct **HTTP status** on the wire. For statuses **not** in the table (e.g. **500**, **503**), **`error.code` is still `SERVER_ERROR`** even though `statusCode` differs.

**Example:** `requestTimeout` middleware uses **`503`**:

```json
{
  "error": {
    "code": "SERVER_ERROR",
    "message": "Request timeout - Service unavailable"
  }
}
```

HTTP status: **503**.

---

## 4. Catalog of `AppError` messages by area

### 4.1 Auth (`auth.service.js`)

| Status | Message |
|--------|---------|
| 400 | `Please provide email and password` |
| 400 | `Email and password must be strings` |
| 400 | `Invalid email format` |
| 401 | `Incorrect email or password` |

### 4.2 Auth middleware (`auth.middleware.js`)

| Status | Message |
|--------|---------|
| 401 | `Not authorized to access this route` |
| 401 | `The user belonging to this token does no longer exist.` |
| 401 | `jwt` verification message or `Not authorized` |

### 4.3 RBAC (`rbac.middleware.js`)

| Status | Message |
|--------|---------|
| 401 | `Not authorized to access this route` |
| 403 | `You do not have permission to perform this action` |

### 4.4 Subscription middleware (`subscription.middleware.js`)

| Status | Message |
|--------|---------|
| 401 | `Not authorized to access this route` |
| 402 | `Premium subscription required` |

### 4.5 Subscription service (`subscription.service.js`)

| Status | Message |
|--------|---------|
| 402 | `Premium subscription required` (`requirePremium` user) |
| 404 | `User not found` (upgrade) |

### 4.6 Rate limit (`rate-limit.middleware.js`)

| Status | Message |
|--------|---------|
| 429 | `Too many requests from this IP, please try again after a minute` |

### 4.7 POI service (`poi.service.js`) — selection

| Status | Example message |
|--------|-------------------|
| 400 | `Latitude and Longitude are required` |
| 400 | `Invalid input type for coordinates` |
| 400 | `Latitude and Longitude must be valid numbers` |
| 400 | `POI code is required` |
| 400 | `location.lat and location.lng are required` |
| 400 | `Request body is required` |
| 400 | `Name is required` |
| 400 | `Radius is required` |
| 400 | `Radius must be a valid number between 1 and 100000 meters` |
| 404 | `POI not found` |
| 409 | `A POI with this code already exists` |
| 429 | `Please wait before submitting the same POI code again` |
| 500 | `Unsupported validation mode` (if `validatePoiInput` called with wrong mode) |

### 4.8 POI request service (`poi-request.service.js`)

| Status | Message |
|--------|---------|
| 400 | `Invalid POI request data. Code, lat and lng are required.` |
| 400 | `Invalid input types for POI request data` |
| 400 | `Latitude and Longitude must be valid numbers` |
| 400 | `Invalid status` |
| 404 | `POI Request not found` |

### 4.9 App 404

| Status | Message |
|--------|---------|
| 404 | `Route <originalUrl> not found` |

---

## 5. Non-`AppError` errors

- **CORS failure:** `cors` callback `Error('Not allowed by CORS')` — may not be formatted by `errorHandler` depending on Express error propagation; treat as server/configuration error during testing.
- **Mongoose / MongoDB:** Uncaught driver errors → typically **500** with generic message (no `statusCode` on error object).

---

## 6. Success envelope (non-error)

Most controllers use:

```json
{ "success": true, "data": ... }
```

POI nearby also includes `count` and `pagination` alongside `success` and `data`.
