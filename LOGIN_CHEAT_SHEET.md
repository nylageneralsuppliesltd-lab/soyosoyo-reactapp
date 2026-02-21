# ⚡ CHEAT SHEET - User Join & Login

## 30-Second Summary

### Normal User
```
ADMIN: Create member in DB → USER: /login → "Enable Member Profile" → Enter email + password → Login works!
```

### Developer  
```
ADMIN: Create member in DB → USER: /login → "Enable Member Profile" → Email + password + DEV_KEY → Developer access!
```

### First Time vs. After
```
FIRST TIME:    Use "Enable Member Profile" tab (creates password)
NEXT TIMES:    Use "Login" tab (use the password you created)
```

---

## Login Right Now (Test Account)

```
URL:      http://localhost:5173/login
Tab:      Click "Login"
Email:    jncnyaboke@gmail.com
Password: SmokePass#2026
```

---

## Two Tabs on Login Page

| Tab | Use When | What It Does |
|-----|----------|------------|
| **Login** | You already have a password | Uses email/phone + password to login |
| **Enable Member Profile** | First time, setting up account | Creates password for member account |

---

## Three-Step Registration (First Time)

1. **Go to Login Page** → /login
2. **Click "Enable Member Profile"** tab
3. **Fill in:**
   ```
   Identifier:    email OR phone
   Password:      New password (6+ chars)
   Dev Key:       [BLANK for normal user] [or special key for developer]
   ```
4. **Click "Enable Profile"**
5. ✅ **Done** - Account ready, logged in automatically

---

## Login After Profile Enabled

1. **Go to Login Page** → /login
2. **Click "Login"** tab
3. **Fill in:**
   ```
   Identifier:    email OR phone
   Password:      Your password
   ```
4. **Click "Sign in"**
5. ✅ **Done** - Logged in

---

## Developer Access

Need the **Developer Access Key** to unlock dev features.

Environment variable: `DEVELOPER_ACCESS_KEY` (in backend .env)

Default: `"CHANGE_ME"` (should be changed in production)

How to use: Enter it in the "Developer Access Key" field on "Enable Member Profile" tab.

---

## Credentials Status

| Email | Password | Type | Status |
|-------|----------|------|--------|
| `jncnyaboke@gmail.com` | `SmokePass#2026` | Member | ✅ Ready to test |

More users: Ask admin to create them in database, then they follow the registration steps.

---

## What Happens When?

| Scenario | What Happens | Where |
|----------|-------------|-------|
| Member doesn't exist | "Member not found" error | Enable Member Profile tab |
| Password wrong | "Invalid credentials" error | Login tab |
| First time setup | Password gets created + hashed | Enable Member Profile tab |
| Dev key correct | Developer status granted | System-side (after profile enabled) |
| Dev key wrong | Profile created as normal user | Profile still works, just no dev access |
| Session expires (12h) | Redirected to login | Auto-happens in browser |

---

## Passwords: How They Work

1. **Before Profile Enabled:**
   - No password exists
   - Member can't login
   - System shows "Member not found"

2. **After Profile Enabled:**
   - Password is created in "Enable Member Profile" step
   - Password is hashed with bcrypt (not stored plain text)
   - Member can login with that password

3. **Forgot Password:**
   - Currently no reset flow
   - Admin would need to clear passwordHash in DB
   - Member repeats "Enable Member Profile" with new password

---

## Diagram: The Flow

```
Database
┌──────────────────────────────────────┐
│ Member Table (Admin-created)         │
│ ├─ name: John                        │
│ ├─ phone: +254712345678              │
│ ├─ email: john@email.com             │
│ ├─ canLogin: false ← Initially!      │
│ └─ passwordHash: null ← No password! │
└─────────────────┬────────────────────┘
                  │
         (John opens browser)
                  │
                  ▼
Software UI: Login Page
┌──────────────────────────────────────┐
│ [Login] [Enable Member Profile]      │
│ John clicks "Enable Member Profile"  │
├──────────────────────────────────────┤
│ Identifier: john@email.com           │
│ Password: SecurePass123              │
│ Developer Key: (blank)               │
│ [Enable Profile] button              │
└─────────────────┬────────────────────┘
                  │
         (System processes)
                  │
                  ▼
Database Updated
┌──────────────────────────────────────┐
│ Member Table                         │
│ ├─ name: John                        │
│ ├─ phone: +254712345678              │
│ ├─ email: john@email.com             │
│ ├─ canLogin: true ✅ ← Updated!      │
│ └─ passwordHash: ***hashed*** ✅     │
│                                      │
│ AppProfile Table (New row created)   │
│ ├─ memberId: John's ID               │
│ ├─ passwordHash: ***hashed***        │
│ └─ developerMode: false              │
└─────────────────┬────────────────────┘
                  │
         (Browser stores JWT)
                  │
                  ▼
Dashboard
┌──────────────────────────────────────┐
│ ✅ Logged in as John                 │
│ Dashboard visible                    │
│ All features accessible              │
└──────────────────────────────────────┘
```

---

## Key Technical Details

| Item | Value |
|------|-------|
| **Password Hashing** | bcryptjs |
| **Session Token** | JWT (JSON Web Token) |
| **Token Expiry** | 12 hours (default) |
| **Storage** | localStorage (browser) |
| **API Auth Header** | `Authorization: Bearer {token}` |
| **Member Type Check** | `canLogin` field |

---

## Endpoints (Backend)

```
POST /api/auth/register-profile    → Enable Member Profile (first time)
POST /api/auth/login                → Login (use existing password)
GET /api/auth/session               → Get current session
POST /api/auth/developer-mode       → Toggle developer mode
```

All protected endpoints require: `Authorization: Bearer {token}`

---

## Remember

- 🔑 **Two tabs**: Login (for existing users) vs. Enable Member Profile (for first-time setup)
- 📝 **Passwords are hashed**: Not stored plain text, bcryptjs encryption
- ⏰ **Sessions expire**: 12 hours, then user must login again
- 👨‍💻 **Dev requires key**: Special environment variable checked during profile enablement
- ✅ **Test credentials ready**: jncnyaboke@gmail.com / SmokePass#2026
