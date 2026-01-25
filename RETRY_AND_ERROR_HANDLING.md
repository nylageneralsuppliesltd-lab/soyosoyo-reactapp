# Silent Retry & Error Handling System

## Overview
Implemented a comprehensive system-wide retry mechanism with exponential backoff for all API calls across the frontend. Network errors (5xx, timeouts, CORS) are now retried silently 3 times without showing error messages to users. Only client errors (4xx) and truly unrecoverable errors display UI messages.

## Problem Solved
- **Render.com Free Tier**: Service idles after 30 minutes of inactivity. Cold starts take 30-60 seconds.
- **Network Instability**: Transient network failures cause CORS, connection refused, timeouts.
- **Poor UX**: Every transient error was displayed to users, creating frustration.
- **Solution**: Silent retries with exponential backoff allow the server to start up while keeping the UI clean.

## Implementation Details

### 1. Retry Utilities

#### `retryFetch.js` - Axios Interceptor
```javascript
// For axios-based APIs (members, deposits, loans, withdrawals, etc.)
createRetryInterceptor(axiosInstance, { maxRetries: 3 })
```
- Intercepts axios responses
- Retries on 5xx, 408 (timeout), 429 (rate limit), and network errors
- Exponential backoff: 1s → 2s → 4s (max 10s)
- Jitter added to prevent thundering herd
- Skips retry for 4xx client errors

#### `fetchWithRetry.js` - Fetch Wrapper
```javascript
// For fetch-based APIs (settings, reports)
const response = await fetchWithRetry(url, { 
  timeout: 15000,
  maxRetries: 3 
})
```
- Wraps native fetch with timeout and retry logic
- Aborts requests after 15 seconds (allows slow server startups)
- Retries on timeouts and network errors
- Same exponential backoff as axios

### 2. API Files Updated

All API files now include:
- Retry interceptor initialization
- Increased timeout to 15 seconds (from 10s)
- Silent error handling in catch blocks

**Updated API Files:**
- `dashboardAPI.js` - Dashboard stats, trends, activities
- `membersAPI.js` - Member CRUD operations
- `financeAPI.js` - Deposits, withdrawals, loans, repayments
- `assetsAPI.js` - Asset management
- `categoryLedgerAPI.js` - Category ledger operations
- `settingsAPI.js` - Accounts and settings (uses fetchWithRetry)

### 3. Component Error Handling

Updated components to distinguish between error types:

```javascript
try {
  const response = await fetchWithRetry(url, { timeout: 15000, maxRetries: 3 });
  // Success case
} catch (err) {
  // Only show UI error for unrecoverable client errors
  if (err.response?.status >= 400 && err.response?.status < 500) {
    setError('Invalid request. Please check your filters.');
  }
  // 5xx and network errors: retried silently, no UI error
  // Data remains empty/default until recovery
}
```

**Updated Components:**
- `MembersList.jsx` - Silent retries for member list fetch
- `GeneralLedgerDetailPage.jsx` - Silent retries for ledger fetch
- `DashboardPage.jsx` - Silent retries for all dashboard stats
- `AccountStatementPage.jsx` - Silent retries for statements & accounts

### 4. Error Message Strategy

**Shown to Users (Client Errors):**
- 400: "Invalid request. Please check your filters."
- 403: "Access denied."
- 404: Not typically reached (server returns valid response)

**Hidden from Users (Network/Server Errors):**
- 5xx: Retried 3 times silently
- 408/429: Retried silently
- CORS errors: Retried silently
- Timeouts: Retried silently
- Connection refused: Retried silently

**Development Logging:**
- Console debug messages in DEV mode only
- Does not spam production user consoles

## Retry Flow Example

```
Initial Request
     ↓
[Failure: Connection Refused]
     ↓
Wait 1000ms + jitter
     ↓
Retry 1
     ↓
[Failure: Timeout]
     ↓
Wait 2000ms + jitter
     ↓
Retry 2
     ↓
[Success: Server Started]
     ↓
Data displayed to user
     ↓
(User sees data appear, not aware of retries)
```

## CORS Configuration

Backend (`main.ts`) is already configured to allow:
- `https://api.soyosoyosacco.com`
- `https://react.soyosoyosacco.com`
- `https://soyosoyo-reactapp-0twy.onrender.com`
- `http://localhost:3000`
- `http://localhost:5173`

No additional CORS changes needed.

## Timeout Values

Set to 15 seconds system-wide to accommodate:
- Render.com cold start (30-60 seconds, but first request usually succeeds within 15s)
- Slow database queries
- Network latency from client to backend

## Testing Checklist

- [x] Dashboard loads without error display during server startup
- [x] Member list retries silently on network errors
- [x] General ledger fetches retry without UI messages
- [x] Account statements load with silent retries
- [x] Settings API calls use fetchWithRetry
- [x] Deposit/withdrawal/loan/repayment APIs have retry support
- [x] Frontend build succeeds without syntax errors
- [x] Timeout set to 15s for slow server startups

## Future Improvements

Optional enhancements (not blocking):
1. **Exponential backoff UI**: Show "Reconnecting..." status only after 2+ failed retries
2. **Circuit Breaker**: Disable retries temporarily if server is down (avoid hammering)
3. **Request Deduplication**: Don't retry identical requests made by user
4. **Fallback UI**: Show cached data while retrying
5. **Chunk Size Warning**: Split vendor bundle to reduce main.js from 1.4MB

## Code References

**Key Files:**
- `frontend/src/utils/retryFetch.js` - Axios retry interceptor
- `frontend/src/utils/fetchWithRetry.js` - Fetch wrapper with retry
- `frontend/src/utils/dashboardAPI.js` - Updated with retry support
- `frontend/src/utils/membersAPI.js` - Updated with retry support
- `frontend/src/components/members/MembersList.jsx` - Silent error handling
- `frontend/src/pages/GeneralLedgerDetailPage.jsx` - Silent error handling
- `frontend/src/pages/DashboardPage.jsx` - Silent error handling
- `frontend/src/pages/AccountStatementPage.jsx` - Uses fetchWithRetry

## Commit Hash
`db50d85` - Frontend: Add silent retry & exponential backoff for all API calls

## Deployment Notes

When deploying to production:
1. All API calls will automatically retry on network errors
2. No configuration needed - retries are baked in
3. Monitor server logs for pattern of connection failures
4. If failures persist, check backend logs and CORS configuration
5. Render.com will start sleeping idle dynos - retries handle the cold start gracefully
