# Member Module Deployment Guide

## Quick Start

This guide walks you through deploying the new world-class SACCO member module to your Render.com hosting.

## Prerequisites

- Git repository with latest changes pushed to `main` branch
- Render.com account with existing backend and frontend deployments
- Backend built and migrations up-to-date

## Backend Deployment (Automatic via Render)

### Step 1: Verify Backend Dependencies

The backend now requires:
```json
{
  "@nestjs/common": "^10.0.0",
  "@nestjs/core": "^10.0.0",
  "@nestjs/platform-express": "^10.0.0",
  "class-validator": "^0.14.0",
  "class-transformer": "^0.5.1",
  "prisma": "^7.0.0",
  "@prisma/client": "^7.0.0"
}
```

All these should already be installed. Verify with:
```bash
cd backend
npm ls | grep class-validator
npm ls | grep class-transformer
```

### Step 2: Database Migration (Auto on Deploy)

The backend's `package.json` start script automatically runs:
```bash
prisma migrate deploy && node dist/main.js
```

This ensures the database is always up-to-date before the server starts.

### Step 3: Trigger Render Deployment

1. Go to [Render Dashboard](https://render.com/dashboard)
2. Click on your backend service (e.g., `soyosoyo-reactapp`)
3. Click **Manual Deploy** > **Deploy latest commit**
4. Wait for the deployment to complete (check logs)

**Expected Logs:**
```
[Nest] 12345   - 01/20/2026, 10:30:00 AM     LOG [NestFactory] Starting Nest application...
[Nest] 12345   - 01/20/2026, 10:30:02 AM     LOG [InstanceLoader] MembersModule dependencies initialized +45ms
[Nest] 12345   - 01/20/2026, 10:30:02 AM     LOG [RoutesResolver] /members {...}: +12ms
Application is running on: http://0.0.0.0:10000
```

### Step 4: Verify Backend is Running

```bash
curl https://soyosoyo-reactapp-0twy.onrender.com/health
```

Should return:
```json
{
  "status": "ok",
  "timestamp": "2026-01-20T10:30:00.000Z"
}
```

## Frontend Deployment (Automatic via Render)

### Step 1: Verify Environment

Frontend `.env` should have:
```
VITE_API_URL=https://soyosoyo-reactapp-0twy.onrender.com
```

This should already be set from previous deployments.

### Step 2: Trigger Render Deployment

1. Go to Render Dashboard
2. Click on your frontend service (e.g., at `api.soyosoyosacco.com`)
3. Click **Manual Deploy** > **Deploy latest commit**
4. Wait for build and deployment to complete

**Build Output should show:**
```
✓ 1234 modules transformed.
dist/index.html    0.45 kB
dist/index.js      245.67 kB
dist/style.css     89.34 kB
```

### Step 3: Clear Browser Cache

After deployment, clear your browser cache:
- Chrome: Ctrl+Shift+Delete
- Firefox: Ctrl+Shift+Delete
- Safari: Develop > Empty Caches

Or use incognito/private mode to test.

## Testing the New Module

### Test on Desktop

1. Navigate to `https://api.soyosoyosacco.com/members`
2. Click **+ Register New Member**
3. Fill in form with valid data:
   ```
   Name: John Doe
   Phone: 0725123456
   Role: Member
   Introducer Name: Jane Smith
   Introducer Member No: M001
   ```
4. Click **Register Member**
5. Should see success message and redirect to members list

### Test Table View

1. On members list page, verify **Table** button is active
2. Should see columns: Name, Phone, Role, Balance, Status, Actions
3. Try filters:
   - Search for a name: type in search box
   - Filter by role: select from dropdown
   - Filter by status: select Active/Suspended

### Test Card View

1. Click **Cards** button
2. Should switch to card layout
3. On mobile/tablet, cards should be full width
4. Swipe/scroll to view more members

### Test Pagination

1. Register multiple members (or use existing ones)
2. Pagination controls should appear at bottom
3. Click **Next** to go to page 2
4. Verify correct members are displayed
5. Previous button should be disabled on page 1

### Test Mobile (using DevTools)

1. Open DevTools (F12)
2. Toggle device toolbar (Ctrl+Shift+M)
3. Set viewport to 375px width (iPhone size)
4. Test:
   - Form inputs (should have 16px font, no zoom)
   - Filters (should be stacked vertically)
   - Card view (should display in single column)
   - Buttons (should be large enough to tap)

## Troubleshooting

### Backend Returns 400 Error

**Problem:** Creating member returns "Bad Request"

**Solution:** Check Render backend logs:
1. Go to Render Dashboard > Backend service
2. Click **Logs** tab
3. Look for error message in red
4. Common errors:
   - "Member with this phone already exists" → Use unique phone
   - "Phone must be a valid Kenyan number" → Check format
   - "Unknown argument customRole" → Old version, rebuild

**Fix:** Delete bad data from database and try again.

### Frontend Can't Reach Backend

**Problem:** Network error or 404

**Solution:**
1. Check `VITE_API_URL` in frontend `.env`
2. Verify backend is running: `curl https://soyosoyo-reactapp-0twy.onrender.com/health`
3. Check CORS settings in backend `src/main.ts`
4. Clear browser cache and refresh

### Form Not Submitting

**Problem:** Button doesn't work or shows loading forever

**Solution:**
1. Open browser DevTools (F12)
2. Go to **Console** tab
3. Look for error messages
4. Common issues:
   - Network tab shows request to wrong URL → fix `.env`
   - Validation errors shown → fix form data
   - CORS error → check backend CORS config

## Verification Checklist

After deployment, verify:

- [ ] Backend is running (health check passes)
- [ ] Frontend loads without errors
- [ ] Create member form appears
- [ ] Can register a new member
- [ ] Member appears in table/list
- [ ] Search works (type name, should filter)
- [ ] Role filter works
- [ ] Status filter works
- [ ] Table view displays correctly
- [ ] Card view displays correctly
- [ ] Pagination works
- [ ] Edit member works
- [ ] Suspend/Reactivate works
- [ ] Mobile responsive design works

## Performance Tuning

### Backend
- Current pagination: 50 records per page (good default)
- Search uses database-level case-insensitive matching
- Indexes on phone (unique constraint)

### Frontend
- CSS is imported in component (tree-shakeable)
- API calls use Axios with sensible defaults
- No unnecessary re-renders

## Monitoring

Monitor your deployments at:
- **Backend:** https://render.com/dashboard
- **Frontend:** https://render.com/dashboard
- **Database:** Neon console at https://console.neon.tech/

Watch for:
- Memory usage increasing over time (memory leak)
- Errors in logs (validation, database, network)
- Response times degrading (database query optimization needed)

## Rolling Back

If something breaks:

### Quick Rollback
1. Go to Render Dashboard
2. Click service
3. Click **Redeploy** button on the previous successful deployment

### Full Rollback
1. Go to GitHub
2. Find the commit before these changes
3. `git revert <commit-hash>`
4. `git push origin main`
5. Trigger Render deployment

## Next Steps

After successful deployment:

1. **Get User Feedback**
   - Test with actual SACCO staff
   - Collect improvement ideas

2. **Add More Features**
   - Member photo upload
   - Bulk CSV import
   - Member export to Excel
   - Dashboard statistics

3. **Optimize**
   - Add caching for member lists
   - Implement member search autocomplete
   - Add activity audit logs

4. **Security**
   - Implement user authentication
   - Add role-based access control
   - Audit sensitive operations

## Support

For issues:

1. Check this guide's troubleshooting section
2. Check Render deployment logs
3. Check browser console for errors
4. Open GitHub issue with error details

---

**Last Updated:** January 20, 2026  
**Deployment Time:** ~5-10 minutes  
**Rollback Time:** ~2-3 minutes
