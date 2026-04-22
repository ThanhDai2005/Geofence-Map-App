# Credit System Baseline Audit — VN-GO Travel

This document establishes the architectural baseline of the VN-GO Travel system prior to the implementation of the **Credit System & Content Unlock**.

---

# 1. Current User Model

### Client-Side (MAUI)
The user state is managed primarily by `AuthService` and represented by `UserDto`.

**Fields (from `LoginDtos.cs`):**
- `Id`: `string?` (Backend UUID)
- `Email`: `string?`
- `FullName`: `string?`
- `Role`: `string?` (Mapped to `USER`, `OWNER`, `ADMIN`)
- `IsPremium`: `bool`
- `QrScanCount`: `int`

**Persistence:**
- Credentials (JWT, Email, Role, IsPremium, UserId) are stored in **`SecureStorage`**.
- A secondary local-only flag `is_premium_v1` is stored in **`Preferences`** via `PremiumService`.

### Backend-Side (Node.js/Mongoose)
Represented by the `User` schema in `user.model.js`.

**Fields:**
- `email`: `String` (Required, unique)
- `fullName`: `String`
- `password`: `String` (Hashed, hidden from queries)
- `role`: `String` (Enum: `user`, `owner`, `admin`)
- `isPremium`: `Boolean`
- `premiumActivatedAt`: `Date`
- `isActive`: `Boolean`
- `qrScanCount`: `Number`

### Gaps for Credit System
- **NOT FOUND**: `CreditBalance` (Missing on both client and server)
- **NOT FOUND**: `AccountTier` (Missing; currently binary `IsPremium` vs `User` role)
- **NOT FOUND**: `UnlockedPOIs` (Missing; no per-POI ownership logic exists)

---

# 2. Current POI Interaction Flow

### The "Entry" Sequence
1. **Trigger**: User scans a QR code (Scanner) or follows a Deep Link.
2. **Coordinator**: `PoiEntryCoordinator.HandleEntryAsync` is invoked.
3. **Scan Resolution**:
    - **Secure Scan**: Calls `POST /pois/scan` with a token.
    - **Legacy Scan**: Parses the code directly from the QR.
4. **Data Hydration**:
    - Backend returns `PoiScanData`.
    - `PoiEntryCoordinator.MergeScanResultIntoLocalAsync` upserts the POI into the local **SQLite** database (`pois` table).
    - Dynamic translations are registered in `ILocalizationService`.
5. **Navigation**:
    - App navigates to `PoiDetailPage` via `/poidetail?code=...`.
6. **UI Display**:
    - `PoiDetailViewModel` loads the POI from SQLite using `GetPoiDetailUseCase`.
    - `PoiHydrationService` attaches localized text in memory.

### Narration Triggers
- **NarrationShort**: Triggered by the "Phát" (Play) button. Calls `PoiNarrationService.PlayPoiAsync`. **Status: FREE.**
- **NarrationLong**: Triggered by the "Nghe chi tiết" (Play Detailed) button. Calls `PoiNarrationService.PlayPoiDetailedAsync`. **Status: PREMIUM GATED.**

---

# 3. Current Premium Logic

### Implementation
- **Gatekeeper**: `PoiDetailViewModel` checks `AuthService.IsPremium`.
- **Gating Point**: `PlayDetailedAsync` method.
- **Upgrade Flow**:
    - If a non-premium user clicks "Nghe chi tiết", an alert is shown.
    - Clicking "Nâng cấp" (Upgrade) invokes `UpgradeAsync`, which currently calls `AuthService.UpdateStoredPremiumAsync(true)`.
    - **Current Limitation**: This is a **local-only toggle** for demo purposes; it persists to `SecureStorage` but does not require a backend transaction or real payment in the current state.

### Backend Premium Check
- Backend has a `requirePremium` middleware in `subscription.middleware.js`.
- It checks `req.user.isPremium`.
- Endpoint `GET /premium/advanced-poi` is protected by this middleware.

---

# 4. Current Data Persistence

### Local (SQLite)
- **Storage**: `pois.db` located in `FileSystem.AppDataDirectory`.
- **Table `pois`**: Stores `Id`, `Code`, `LanguageCode`, `Name`, `Summary`, `NarrationShort`, `NarrationLong`, `Latitude`, `Longitude`, `Radius`, `Priority`.
- **Table `PoiTranslationCacheEntry`**: Stores auto-translated content for non-standard languages.
- **Caching Strategy**: The app seeds from a bundled `pois.json` on first run. Subsequent scans or syncs update the SQLite rows.

### Remote (Backend)
- **MongoDB**: Stores authoritative `User` and `POI` data.
- **Persistence**: User profiles, scan counts, and premium status are persisted.
- **NOT Persisted**: Local translation cache and temporary UI state.

---

# 5. Current Offline Behavior

### What Works Offline
- **Map Interaction**: Core POI pins (if already in SQLite).
- **POI Details**: Viewing already visited or seeded POIs.
- **Narration**: TTS (Text-to-Speech) works if the OS has the required voice packs installed locally.
- **Session**: `AuthService.RestoreSessionAsync` allows app entry if a valid JWT is in `SecureStorage`.

### What Breaks Offline
- **QR Scanning**: Secure scans (`/pois/scan`) require API access.
- **Dynamic Translation**: `PoiTranslationService` requires API access to translate content on-the-fly.
- **Sync**: `SyncPoisFromServerAsync` requires connectivity.
- **Telemetry Sync**: Events are enqueued in memory but require a sink to be flushed (currently `LoggingTranslationEventBatchSink` logs locally).

---

# 6. Current API Contracts

### User / Auth
- `POST /auth/login`: `{email, password}` -> `{success, data: {token, user: {id, email, role, isPremium, ...}}}`
- `POST /auth/register`: `{fullName, email, password}` -> `{success, data: {token, user}}`
- `POST /subscription/upgrade`: (Updates `isPremium = true` for the session user)

### POI System
- `POST /pois/scan`: `{token}` -> `{success, data: {code, name, summary, narrationShort, narrationLong, location: {lat, lng}, ...}}`
- `GET /pois/nearby`: `?lat=...&lng=...&radius=...` -> `List<Poi>`
- `GET /pois/code/:code`: Returns full POI details.

---

# 7. GAPS vs CREDIT SYSTEM REQUIREMENTS

| Feature | Current State | Requirement | Status |
| :--- | :--- | :--- | :--- |
| **User Credits** | `qrScanCount` exists (read-only) | `CreditBalance` (spendable) | **MISSING** |
| **Tier System** | `isPremium` (Boolean) | `AccountTier` (Free/Silver/Gold/Premium) | **MISSING** |
| **Content Unlock** | All-or-nothing (Premium) | `UnlockedPOIs` (Specific POI ownership) | **MISSING** |
| **Roles** | `USER`, `OWNER`, `ADMIN` | `User`, `Owner`, `Admin` | **EXISTING** |

---

# 8. IMPACT ANALYSIS

### UI Changes
- **PoiDetailPage**: Needs "Unlock for [X] Credits" button for non-premium/non-owners.
- **ProfilePage**: Needs to display Credit Balance and Tier.
- **Navigation**: QR scanning might need to check balance before allowing "Entry".

### Services
- **`AuthService`**: Needs to handle `CreditBalance` and `AccountTier` updates.
- **`PoiEntryCoordinator`**: Needs a pre-scan credit check or auto-spend logic.
- **`PoiNarrationService`**: Gating logic needs to move from `IsPremium` to `IsUnlocked(poiCode)`.

### Data Layer
- **SQLite**: New `unlocked_pois` table or column in `pois`.
- **Backend**: `User` schema update; new `Transaction` model for credit history.

---

# 9. RISK ANALYSIS

- **Double Charge**: Race condition between spending credits and unlocking POI locally vs server.
- **Offline Inconsistency**: User unlocks POI offline (if possible) but server doesn't know. *Recommendation: Require online for Spend/Unlock.*
- **API Idempotency**: `POST /credits/spend` must be idempotent to prevent multiple charges on retry.
- **Sync Lag**: User buys credits on Web but Mobile doesn't reflect it until re-sync.

---

# 10. UPGRADE STRATEGY (High-Level)

### Phase 1: Data Schema
- Update Backend `User` model with `credits` and `tier`.
- Create `unlocked_pois` collection/table.

### Phase 2: Credit API
- Implement `POST /credits/spend`.
- Implement `GET /users/me` with updated fields.

### Phase 3: Client Integration
- Update `AuthService` to fetch/store credits.
- Refactor `PoiDetailViewModel` to check unlock status.

### Phase 4: Sync & Polish
- Handle offline "locked" UI states.
- Implement credit purchase/top-up UI (mock or real).
