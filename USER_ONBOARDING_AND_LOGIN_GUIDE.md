# 🔐 User Onboarding & Login Guide

## Overview

The system has a **two-tier user creation model**:
1. **Members** - Created by admin in the database (no password initially)
2. **User Profiles** - Created by members themselves via "Enable Member Profile" registration

---

## How a Normal User Joins

### Step 1: Admin Creates Member Account
Members are typically created in the database by an admin. They:
- Have name, phone, email, ID number, employment details
- Have `canLogin: false` and `passwordHash: null` initially
- **Cannot login yet** - they need to enable their profile first

### Step 2: User "Enables Member Profile"
Once a member exists in the system, they register themselves:

**On Login Page:**
1. Click **"Enable Member Profile"** tab
2. Enter **one of**:
   - Their **Member ID** (if they know it), OR
   - Their **Email or Phone** (as identifier)
3. Create a **Password** (6+ characters)
4. Leave "Developer Access Key" empty (unless they're a developer)
5. Click **"Enable Profile"**

**What happens:**
- System finds the member (by ID or email/phone)
- Sets their password hash
- Sets `canLogin: true`
- Creates an `AppProfile` for them
- Issues JWT token
- Redirects to dashboard

### Step 3: User Can Now Login
**On Login Page:**
1. Click **"Login"** tab
2. Enter email or phone
3. Enter password
4. Click **"Sign in"**

---

## How a Developer Joins

### Developer Setup
Developers join just like normal users, BUT with a special **Developer Access Key**:

**On Login Page (Enable Member Profile tab):**
1. Enter member ID/email/phone
2. Create password
3. Enter **Developer Access Key** in the special field
4. Click **"Enable Profile"**

**What happens:**
- System validates the access key against `DEVELOPER_ACCESS_KEY` env var
- If matches: Sets `isSystemDeveloper: true` on their member record
- Grants access to developer features (developer mode, full platform overview)

---

## Current System State - Login Credentials

### ✅ Working Test Account
**Already registered and ready to use:**
- **Email**: `jncnyaboke@gmail.com`
- **Password**: `SmokePass#2026`

This account was used for Cypress E2E testing and is fully set up.

### To Test Login:
```
1. Visit: http://localhost:5173/login
2. Click "Login" tab
3. Enter email: jncnyaboke@gmail.com
4. Enter password: SmokePass#2026
5. Click "Sign in"
6. ✓ Should see dashboard
```

---

## Detailed Workflows

### Workflow A: New Member's First Time
```
┌──────────────────────────────────┐
│ 1. Admin adds to database        │
│    (ID 42, phone +254712345678)  │
│    Status: canLogin=false         │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│ 2. Member goes to /login         │
│    Clicks "Enable Member Profile"│
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│ 3. Enters:                       │
│    - Identifier: +254712345678   │
│    - Password: MySecret123!      │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│ 4. System:                       │
│    - Finds member by phone       │
│    - Hashes password             │
│    - Sets canLogin=true          │
│    - Creates AppProfile          │
│    - Issues JWT token            │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│ 5. Redirects to /dashboard       │
│    ✓ Member now has full access  │
└──────────────────────────────────┘
```

### Workflow B: Developer Setup
```
┌──────────────────────────────────┐
│ 1. Admin creates member          │
│    + Marks isSystemDeveloper=true│
│ 2. Member enables profile BUT    │
│    enters Developer Access Key   │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│ 3. System validates key against  │
│    process.env.DEVELOPER_ACCESS_KEY
│    (env var, default: "CHANGE_ME")
└──────────────┬───────────────────┘
               │
               ▼
    ┌──────────┴───────────┐
    │                      │
Keys Match?           Keys Don't Match?
    │                      │
    ▼                      ▼
✓ Developer Granted  ✗ Access Denied
Status Set           Profile still created
                     but no dev privileges
```

---

## Database Schema

### Member Table
```sql
CREATE TABLE Member (
  id                    INTEGER PRIMARY KEY
  name                  VARCHAR(255)
  phone                 VARCHAR(20) UNIQUE
  email                 VARCHAR(255)
  passwordHash          VARCHAR(255)          -- NULL until profile enabled
  canLogin              BOOLEAN DEFAULT false  -- false until profile enabled
  isSystemDeveloper     BOOLEAN DEFAULT false
  developerMode         BOOLEAN DEFAULT false
  ...other fields
)
```

### AppProfile Table
```sql
CREATE TABLE AppProfile (
  id                    INTEGER PRIMARY KEY
  memberId              INTEGER UNIQUE (foreign key)
  fullName              VARCHAR(255)
  passwordHash          VARCHAR(255)
  isPlatformAdmin       BOOLEAN
  isSystemDeveloper     BOOLEAN
  developerModeEnabled  BOOLEAN
)
```

---

## Environment Variables (Backend)

### In `.env` file:
```bash
# JWT token secret (default: "change-this-secret")
JWT_SECRET=your-secret-key-here

# JWT expiration time (default: "12h")
JWT_EXPIRES_IN=12h

# Developer access key for registering developers
# (default: "CHANGE_ME")
DEVELOPER_ACCESS_KEY=dev-key-here-change-me
```

### Current Production Setup:
```
JWT_SECRET          = [set in production]
JWT_EXPIRES_IN      = 12h (default)
DEVELOPER_ACCESS_KEY = CHANGE_ME (default - should be changed)
```

---

## Login Flow (Technical)

### 1. Register New Profile
```
POST /api/auth/register-profile
{
  "identifier": "email@example.com",  // OR "+254712345678" (phone)
  "password": "SecurePass123",
  "memberId": 42,                      // optional if identifier provided
  "developerAccessKey": "..."          // optional
}

Response (200):
{
  "token": "eyJ...",
  "user": {
    "id": 42,
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+254712345678",
    "isSystemDeveloper": false,
    "developerMode": false
  }
}
```

### 2. Login
```
POST /api/auth/login
{
  "identifier": "email@example.com",  // OR "+254712345678" (phone)
  "password": "SecurePass123"
}

Response (200):
{
  "token": "eyJ...",
  "user": { ... }
}
```

### 3. Token Usage
All subsequent requests include token:
```
GET /api/dashboard
Authorization: Bearer eyJ...
```

### 4. Token Expiry
- Default: 12 hours
- After expiry: API returns 401 → frontend redirects to /login
- Frontend ProtectedRoute forces re-login

---

## Practical Examples

### Example 1: Register New User (Normal Member)
```
1. Go to http://localhost:5173/login
2. Click "Enable Member Profile"
3. Enter:
   - Identifier: jncnyaboke@gmail.com  (this member already exists in DB)
   - Password: MyNewPassword123
   - Leave Developer key blank
4. Click "Enable Profile"
5. ✓ Logged in, see dashboard
```

### Example 2: Register Developer (if access key is known)
```
Assume: DEVELOPER_ACCESS_KEY = "super-secret-dev-key-12345"

1. Go to http://localhost:5173/login
2. Click "Enable Member Profile"
3. Enter:
   - Identifier: email@example.com
   - Password: DevPassword123
   - Developer Access Key: super-secret-dev-key-12345
4. Click "Enable Profile"
5. ✓ Logged in as developer, can access developer features
```

### Example 3: Login After Profile Enabled
```
1. Go to http://localhost:5173/login
2. Click "Login"
3. Enter:
   - Identifier: jncnyaboke@gmail.com
   - Password: MyNewPassword123
4. Click "Sign in"
5. ✓ Logged in, see dashboard
```

---

## Troubleshooting

### "Member not found" error
- Check that the email/phone is correct
- Verify member exists in database (admin must create first)
- Try using Member ID instead

### "Invalid credentials" (during login)
- Password is wrong
- Try resetting by enabling profile again (if allowed)
- Can only re-enable once per member typically

### "Developer access denied"
- Access key in .env doesn't match what you entered
- Current default: `DEVELOPER_ACCESS_KEY=CHANGE_ME`
- Ask admin for the correct key

### Session expires too quickly
- Check JWT_EXPIRES_IN in backend .env
- Default is 12 hours
- Frontend shows message: "Your session expired. Please log in again."

---

## Security Notes

1. **Passwords are hashed** with bcryptjs (not stored plain text)
2. **JWT tokens expire** after 12 hours by default
3. **Session persists** in localStorage after login
4. **API requires Bearer token** - all requests must include JWT
5. **Developer keys** are environment variables (not in code)
6. **Developer mode** can be toggled on/off by the user (if developer)

---

## Summary Table

| User Type | Steps to Join | How to Login | Access Level |
|-----------|---------------|-------------|--------------|
| **Normal Member** | 1. Admin creates in DB 2. User enables profile with password | Email/phone + password | Dashboard, deposits, loans, reports |
| **Developer** | 1. Admin creates + marks developer 2. User enables profile + dev access key | Same as member | All features + developer mode + admin options |
| **Admin** | Same as developer (role-based via member record) | Same as member | All features + settings + user management |

---

## Current Test Credentials (Verified Working)
```
Email:    jncnyaboke@gmail.com
Password: SmokePass#2026
Type:     Normal Member (can promote to developer if needed)
Status:   ✓ Created, password set, canLogin=true
```

Use this to test the full flow, then create your own users by following the workflows above.
