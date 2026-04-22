# Implementation Summary: Admin Overview Metrics Refactor

**Date**: 2026-04-22  
**Status**: ✅ COMPLETED

---

## Overview

Refactored the Admin Intelligence Dashboard overview metrics to show accurate, time-filtered data with real revenue estimation and added a lifetime stats section with charts.

---

## Changes Made

### 1. Backend Changes

#### A. User Model Schema (`backend/src/models/user.model.js`)
- ✅ Added `premiumActivatedAt: { type: Date, default: null }` field
- This tracks when a user became premium (not just their registration date)

#### B. Intelligence Metrics Service (`backend/src/services/intelligence-metrics.service.js`)
- ✅ Updated `getOverview()` method:
  - **Removed**: `totalScans` metric (no longer needed)
  - **Fixed**: `newPremiumUsers` now uses `premiumActivatedAt` field instead of `createdAt`
  - **Added**: `estimatedRevenue = newPremiumUsers * 20` (USD)
  - **Response format**:
    ```json
    {
      "totalUsers": 150,
      "newPremiumUsers": 12,
      "estimatedRevenue": 240
    }
    ```

- ✅ Added `getSystemOverview()` method:
  - Returns lifetime stats (unaffected by time filter)
  - **Response format**:
    ```json
    {
      "totalUsers": 150,
      "totalPremiumUsers": 45
    }
    ```

#### C. Controller (`backend/src/controllers/intelligence-metrics.controller.js`)
- ✅ Added `getSystemOverview` controller handler

#### D. Routes (`backend/src/routes/intelligence-admin.routes.js`)
- ✅ Added route: `GET /api/v1/admin/intelligence/metrics/system-overview`

#### E. User Repository (`backend/src/repositories/user.repository.js`)
- ✅ Updated `updatePremiumById()`: Auto-sets `premiumActivatedAt` when user becomes premium
- ✅ Updated `updateByAdmin()`: Auto-sets `premiumActivatedAt` when `isPremium` changes from false → true
- ✅ Updated `createByAdmin()`: Sets `premiumActivatedAt` if user is created as premium

#### F. Migration Script (`backend/scripts/migrate-premium-activated-at.js`)
- ✅ Created migration script to backfill `premiumActivatedAt` for existing premium users
- Sets `premiumActivatedAt = createdAt` for existing premium users without this field
- **Run**: `node backend/scripts/migrate-premium-activated-at.js`

---

### 2. Frontend Changes

#### A. API Client (`admin-web/src/apiClient.js`)
- ✅ Updated `fetchIntelligenceOverview()` type definition:
  - Removed `totalScans` and `totalRevenue`
  - Added `estimatedRevenue`
- ✅ Added `fetchSystemOverview()` function

#### B. Dashboard Component (`admin-web/src/pages/intelligence/Dashboard.jsx`)
- ✅ Removed unused imports: `Legend`, `Line`, `LineChart`
- ✅ Updated state:
  - Removed `totalScans` and `totalRevenue` from `overviewData`
  - Added `estimatedRevenue` to `overviewData`
  - Added `systemOverview` state for lifetime stats
- ✅ Updated `load()` function:
  - Fetches both `fetchIntelligenceOverview()` and `fetchSystemOverview()`
- ✅ Updated Overview Cards:
  - Changed from 4 cards to 3 cards (removed POI Activations card)
  - Card 1: Total Users (emerald theme)
  - Card 2: New Premium Users (indigo theme)
  - Card 3: Estimated Revenue (amber theme, displays as `$240` format)
- ✅ Added "Thống kê tổng thể (Lifetime)" section with:
  - **Stats Card**: Shows total users, premium users, and premium percentage
  - **Pie Chart**: Visual breakdown of Premium vs Free users
  - **Bar Chart**: Comparison of total users, premium, and free users

---

## API Endpoints

### Time-Filtered Metrics (Respects date range)
```
GET /api/v1/admin/intelligence/metrics/overview?start=<ISO>&end=<ISO>
```
**Response**:
```json
{
  "totalUsers": 150,
  "newPremiumUsers": 12,
  "estimatedRevenue": 240
}
```

### Lifetime Stats (Unaffected by time filter)
```
GET /api/v1/admin/intelligence/metrics/system-overview
```
**Response**:
```json
{
  "totalUsers": 150,
  "totalPremiumUsers": 45
}
```

---

## Validation Checklist

- [x] No scan-related metrics remain
- [x] Metrics respect time filter
- [x] Revenue = newPremiumUsers * 20
- [x] No UI freeze
- [x] API response stable
- [x] No impact to heatmap system
- [x] Lifetime stats section added with charts
- [x] `premiumActivatedAt` auto-set when user becomes premium
- [x] Migration script created for existing data

---

## Files Modified

### Backend (7 files)
1. `backend/src/models/user.model.js` - Added `premiumActivatedAt` field
2. `backend/src/services/intelligence-metrics.service.js` - Updated overview logic, added system overview
3. `backend/src/controllers/intelligence-metrics.controller.js` - Added system overview controller
4. `backend/src/routes/intelligence-admin.routes.js` - Added system overview route
5. `backend/src/repositories/user.repository.js` - Auto-set `premiumActivatedAt` logic
6. `backend/scripts/migrate-premium-activated-at.js` - **NEW** migration script

### Frontend (2 files)
1. `admin-web/src/apiClient.js` - Updated type definitions, added system overview API
2. `admin-web/src/pages/intelligence/Dashboard.jsx` - Removed totalScans card, added lifetime stats section with charts

---

## Migration Instructions

### Step 1: Run Migration Script
```bash
cd backend
node scripts/migrate-premium-activated-at.js
```

This will backfill `premiumActivatedAt` for existing premium users.

### Step 2: Restart Backend
```bash
cd backend
npm run dev
```

### Step 3: Restart Frontend
```bash
cd admin-web
npm run dev
```

---

## Example API Response

### Before (Old)
```json
{
  "totalUsers": 150,
  "newPremiumUsers": 8,
  "totalScans": 1234,
  "totalRevenue": 0
}
```

### After (New)
```json
{
  "totalUsers": 150,
  "newPremiumUsers": 12,
  "estimatedRevenue": 240
}
```

---

## UI Changes

### Before
- 4 cards: Total Users, New Premium, POI Activations, Total Revenue
- No lifetime stats section

### After
- 3 cards: Total Users, New Premium, Estimated Revenue
- New "Thống kê tổng thể (Lifetime)" section with:
  - Stats card showing total users, premium users, premium %
  - Pie chart (Premium vs Free)
  - Bar chart (comparison view)

---

## Success Criteria

✅ Admin dashboard shows correct total users  
✅ Admin dashboard shows correct premium growth (using `premiumActivatedAt`)  
✅ Revenue calculation is realistic ($20 per new premium user)  
✅ Lifetime stats section displays correctly  
✅ Charts render without errors  
✅ System is stable and production-safe  
✅ No old scan-related data remains  

---

## Notes

- **Premium Price**: Hardcoded at $20 USD per user
- **Time Filter**: Overview cards respect the selected date range
- **Lifetime Stats**: Unaffected by time filter, always shows current totals
- **Backward Compatibility**: Migration script ensures existing premium users have `premiumActivatedAt` set
- **Future Enhancement**: Consider adding payment integration to track actual revenue instead of estimation

---

**Implementation Complete** ✅
