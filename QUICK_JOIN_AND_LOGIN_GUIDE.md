# Quick Answer: User Join & Login

## Your Questions Answered

### 1️⃣ How Does a Normal User Join?

**Two-step process:**

**Step A: Admin Creates Member** (already done in database)
- Admin adds person to `Member` table
- Fields: name, phone, email, ID number, etc.
- They have `canLogin = false` (can't login yet)
- No password set (`passwordHash = NULL`)

**Step B: Member Enables Their Profile**
1. Visit: http://localhost:5173/login
2. Click: **"Enable Member Profile"** tab
3. Enter:
   - Email OR phone (their identifier)
   - New password (6+ characters)
4. Click: "Enable Profile"
5. ✅ **Account activated** - can now login

That's it! They now have a password and `canLogin = true`.

---

### 2️⃣ How Does a Developer Join?

**Same as normal user, plus one extra step:**

1. Visit: http://localhost:5173/login
2. Click: **"Enable Member Profile"** tab
3. Enter:
   - Email OR phone
   - New password
   - **Developer Access Key** (special field) ← This is the difference
4. Click: "Enable Profile"

**If the access key matches the `DEVELOPER_ACCESS_KEY` in backend .env:**
- ✅ **Developer status granted** automatically
- Access to developer mode, admin features, etc.

**If key is wrong:**
- Profile still created normally (just not as developer)

---

### 3️⃣ How Do You Login Since Passwords Weren't Set?

**The answer depends on whether it's the first time:**

#### First Time Ever (Member Profile Doesn't Exist Yet):
Use **"Enable Member Profile"** tab → creates profile + password in one step

#### After Profile Enabled (Password Now Exists):
Use **"Login"** tab → use email/phone + password

---

## Quick Test Right Now

**Credentials already set up and ready:**
```
Email:    jncnyaboke@gmail.com
Password: SmokePass#2026
```

**To login:**
1. Go to: http://localhost:5173/login
2. Click: "Login" tab
3. Enter the email and password above
4. ✅ You're in!

---

## The Key Insight

The system distinguishes between:
- **Member** = Record in database (created by admin)
- **Profile** = Login credentials (member self-creates via "Enable Profile")

A member exists before they can login. They must "enable" their profile first (set a password) before login works.

---

## Diagram

```
┌─────────────────────────┐
│ Member in Database      │ ← Admin creates these
│ canLogin: false         │   (no password)
│ passwordHash: null      │
└────────────┬────────────┘
             │
             │ Member visits /login
             │ Clicks "Enable Member Profile"
             │ Enters email + new password
             │
             ▼
┌─────────────────────────┐
│ Member can now login!   │ ← Credentials stored
│ canLogin: true          │   Password hashed
│ passwordHash: ***       │
└────────────┬────────────┘
             │
             │ Member visits /login
             │ Clicks "Login"
             │ Enters email + password
             │
             ▼
┌─────────────────────────┐
│ ✅ Logged in!           │
│ JWT issued              │
│ Dashboard accessible    │
└─────────────────────────┘
```

---

## For Developers Specifically

If you need to create a developer account:

**Assume `DEVELOPER_ACCESS_KEY = "super-secret-dev-key-abc123"` (in backend .env)**

1. Go to: http://localhost:5173/login
2. Click: "Enable Member Profile"
3. Enter:
   - Email: your.email@company.com
   - Password: YourSecurePass123
   - **Developer Access Key: super-secret-dev-key-abc123**
4. Click: "Enable Profile"
5. ✅ You're now a developer!

After that, normal login with email + password.

---

## Summary

| Question | Answer |
|----------|--------|
| **How do normal users join?** | Admin creates member → User enables profile (adds password) → Can login |
| **How do developers join?** | Same as above, but also enter developer access key during profile enablement |
| **How to login with no passwords?** | First time: "Enable Member Profile" creates credentials. After that: Use "Login" with email + password |
| **Test credentials available?** | Yes: `jncnyaboke@gmail.com` / `SmokePass#2026` |

---

## What to Do Next

1. **Test the existing account:**
   ```
   Email:    jncnyaboke@gmail.com
   Password: SmokePass#2026
   ```

2. **Create new users:**
   - Admin adds member to database
   - Send them to /login
   - They click "Enable Member Profile"
   - They set their own password
   - They can now login

3. **Create developers:**
   - Same as above, but they also enter the developer access key
   - Key: Defined in backend .env as `DEVELOPER_ACCESS_KEY`

---

**Full guide available in:** `USER_ONBOARDING_AND_LOGIN_GUIDE.md`
