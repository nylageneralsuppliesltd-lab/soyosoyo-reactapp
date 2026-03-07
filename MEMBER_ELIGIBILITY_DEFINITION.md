# Member Activity & Dividend Eligibility Definition

**Document Version:** 1.0  
**Last Updated:** February 28, 2026  
**Status:** Production (Commit 9eb2e91)

---

## Table of Contents

1. [Overview](#overview)
2. [Member Activity Flag](#member-activity-flag)
3. [Dividend Eligibility](#dividend-eligibility)
4. [Configurable Dividend Criteria](#configurable-dividend-criteria)
5. [Data Flow Architecture](#data-flow-architecture)
6. [Implementation Details](#implementation-details)
7. [UI/UX](#uiux)
8. [API Reference](#api-reference)
9. [Audit Trail](#audit-trail)

---

## Overview

The system distinguishes between two independent member statuses:

- **Member Activity** - Administrative flag indicating whether a member's account is active or suspended
- **Dividend Eligibility** - Computed status based on configurable business rules; determines whether a member qualifies to receive dividend payouts

Both are calculated/stored at query time (not pre-computed and cached in database), allowing dynamic policy changes without data mutations.

---

## Member Activity Flag

### Definition

A member is **active** if the `active` database field is `true`. A member is **suspended** if `active` is `false`.

### Purpose

- Administrative control over who can transact (take loans, make contributions)
- Optional gate for dividend eligibility (can be enabled/disabled via settings)
- Displayed in UI with status badges and color coding

### How It's Set

- Automatic: Created as `active: true` when member joins the SACCO
- Manual: Toggled via member edit form or bulk suspend/reactivate actions in Members UI
- Storage: Persisted in `member.active` boolean field in database

### How It's Displayed

- **Member List**: Status badge showing "🟢 Active" or "🔴 Suspended"  
- **Member Ledger**: Status indicator in member details header
- **Settings**: Tooltip in eligibility reason explains if member is suspended

---

## Dividend Eligibility

### Definition

A member is **dividend eligible** if they satisfy all enabled dividend criteria configured in system settings. Eligibility is computed at query time by the backend; individual member status does not change until next API call.

### Computation

Eligibility is determined by a series of **configurable checks**. Each check can be enabled/disabled independently via system settings. All enabled checks must pass for the member to be eligible.

**Default Eligibility Logic** (can be modified in System Settings):

1. **Member Must Be Active** (optional) — `active = true`
2. **Must Have Paid Registration Fee** (optional) — `registrationFeeContributions > 0`
3. **Must Have Eligible Contributions** (optional) — `shareCapitalContributions + monthlyMinimumContribution > 0`
4. **Must Have No Arrears Above Threshold** (optional) — `totalArrears ≤ maxAllowedArrears`
5. **Monthly Contributions Must Meet Expectation** (informational) — `monthlyInvoiceAmount >= configured amount`

### Eligibility Reason

When a member is **not eligible**, the system computes a human-readable reason explaining which criteria failed:

- "Member is suspended" — Active member check failed
- "Registration fee not paid" — Registration fee check failed
- "No eligible contributions recorded" — Eligible contributions check failed
- "Has contribution arrears above allowed threshold (X.XX)" — Arrears check failed
- (Multiple reasons joined with `; `)

When **eligible**, reason displays: "Eligible: member satisfies all configured dividend criteria"

---

## Configurable Dividend Criteria

### The 6 Configurable Parameters

All dividend eligibility criteria are user-configurable via **System Settings → Dividend Eligibility Criteria** tab in the frontend.

| Parameter | Type | Default | Purpose | Notes |
|-----------|------|---------|---------|-------|
| **Monthly Contribution Expectation** | Number (KES) | 200 | Expected monthly contribution amount | Informational display; not enforced in eligibility calculation |
| **Require Active Member** | Boolean (yes/no) | Yes | Must member be active to be eligible? | If "No", suspended members can be eligible |
| **Require Registration Fee Paid** | Boolean (yes/no) | Yes | Must member have paid registration fee? | Typical gate: must invest initial capital |
| **Require Eligible Contributions** | Boolean (yes/no) | Yes | Must member have share capital or monthly minimum contributions? | Filters members with only fees/risk fund |
| **Require No Arrears** | Boolean (yes/no) | Yes | Must member's arrears be below threshold? | If "No", members with any arrears are eligible |
| **Max Allowed Arrears** | Number (KES) | 0.00 | Threshold for arrears check | Only applies if "Require No Arrears" = Yes; members with arrears ≤ this amount are eligible |

### How Settings Are Stored

- **Storage Location**: Browser's `localStorage` under key `systemSettings`
- **Scope**: Per-browser/per-device (each user's device has independent settings)
- **Persistence**: Saved when user clicks "💾 Save All Settings" button in System Settings
- **Fallback**: If localStorage is empty/corrupted, system uses hardcoded defaults

### Storage Format (JSON)

```json
{
  "organizationName": "SOYOSOYO MEDICARE COOPERATE SAVINGS AND CREDIT SOCIETY",
  "maxLoanMultiple": 3,
  "defaultLoanTermMonths": 12,
  "defaultInterestRate": 10,
  "enableFines": true,
  "finePercentage": 2,
  "currency": "KES",
  "fiscalYearStart": "01-01",
  "dividendMonthlyInvoiceAmount": 200,
  "dividendRequireActive": true,
  "dividendRequireRegistrationFee": true,
  "dividendRequireEligibleContributions": true,
  "dividendRequireNoArrears": true,
  "dividendMaxAllowedArrears": 0
}
```

---

## Data Flow Architecture

### Flow Diagram: Setting → API → Computation → Display

```
┌─────────────────────────────────────────────────────────────┐
│ 1. FRONTEND: User Modifies Settings                         │
│              SettingsPage.jsx                               │
│              → systemSettings state updated                 │
│              → "Save All Settings" clicked                  │
│              → localStorage.setItem('systemSettings', ...)  │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│ 2. FRONTEND: Member List Fetches with Criteria              │
│              MembersList.jsx                                │
│              → Reads systemSettings from localStorage       │
│              → Reads 6 dividend params from settings        │
│              → Constructs URLSearchParams with criteria     │
│              → Sends GET /members?dividendMonthlyInvoice... │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│ 3. BACKEND: Controller Receives Query Parameters            │
│              members.controller.ts @Get()                   │
│              → Parses 6 dividend query params               │
│              → Validates types (boolean/number)             │
│              → Passes dividendCriteria to service.findAll() │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│ 4. BACKEND: Service Normalizes & Applies Criteria           │
│              members.service.ts                             │
│              → Calls normalizeDividendCriteria()            │
│              → Merges user input with safe defaults         │
│              → Calls computeMemberStatuses() for each       │
│              → Returns dividendEligible + reason            │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│ 5. FRONTEND: Displays Eligibility & Reason                  │
│              MembersList.jsx                                │
│              → Shows member.dividendEligible badge          │
│              → Displays member.dividendEligibilityReason    │
│              → as hover tooltip on eligibility cell         │
└─────────────────────────────────────────────────────────────┘
```

### Key Principle

**Settings drive eligibility.** If a user changes a setting and refreshes the members page, all eligibility statuses recalculate immediately based on the new criteria. No database changes required.

---

## Implementation Details

### Frontend Components

#### SettingsPage.jsx

- **File**: `frontend/src/pages/SettingsPage.jsx`
- **Responsibility**: Renders system settings form including dividend criteria controls
- **Key Variables**:
  - `DEFAULT_SYSTEM_SETTINGS` (lines 9–23): Hardcoded defaults
  - `systemSettings` state: Current settings object
  - `handleSaveSystemSettings()` (lines 79–85): Persists to localStorage
- **UI Section** (lines 287–397): "Dividend Eligibility Criteria" form group with 6 controls
- **Flow**: User fills form → clicks Save → localStorage updated → next member list fetch uses new criteria

#### MembersList.jsx

- **File**: `frontend/src/components/members/MembersList.jsx`
- **Responsibility**: Fetches and displays member list with eligibility computations
- **Key Variables**:
  - `DEFAULT_DIVIDEND_SETTINGS` (lines 11–17): Fallback if localStorage empty
  - `fetchMembers()` (lines 79–130): Reads settings, attaches 6 criteria params to API call
  - `isDividendEligible()` (lines 46–57): Falls back to backend value; local fallback logic if backend doesn't return field
  - `getDividendEligibilityReason()` (lines 59–73): Uses backend reason; local fallback if unavailable
- **Flow**: Component mounts → reads localStorage → calls fetchMembers() → API call includes criteria → renders results with eligibility badges and tooltips

### Backend Components

#### members.service.ts

- **File**: `backend/src/members/members.service.ts`
- **Responsibility**: Core business logic for member operations and dividend eligibility computation
- **Key Functions**:
  - `DividendCriteriaOptions` interface (lines 14–20): Defines 6 criteria fields
  - `DEFAULT_DIVIDEND_CRITERIA` (lines 22–31): Safe hardcoded defaults
  - `normalizeDividendCriteria()` (lines 33–54): Takes partial user input, merges with defaults, validates types
  - `computeMemberStatuses()` (lines 76–111): Applies each criterion check conditionally based on `criteria.require*` flags; returns eligibility + reason
  - `findAll()` method (lines 142–335): Accepts dividendCriteria in options; calls normalizeDividendCriteria(); passes to computeMemberStatuses() for each member
- **Flow**: Controller passes dividendCriteria → service normalizes → service computes status for each member → returns member dto with dividendEligible, dividendEligibilityStatus, dividendPayableStatus, dividendEligibilityReason fields

#### members.controller.ts

- **File**: `backend/src/members/members.controller.ts`
- **Responsibility**: HTTP API endpoint handler for GET /members route
- **Key Variables**:
  - `@Get()` route (lines 31–80): Accepts 6 dividend query params
  - `parseOptionalBoolean()` (lines 48–54): Safely converts string 'true'/'false' to boolean
  - `parseOptionalNumber()` (lines 56–62): Safely converts string to number
- **Flow**: HTTP request arrives with query params → controller parses types → constructs dividendCriteria object → passes to service.findAll()

### Computation Logic (Detailed Example)

Given:
- `requireActive: true`
- `requireRegistrationFee: true`
- `requireEligibleContributions: false`  ← disabled
- `requireNoArrears: true`
- `maxAllowedArrears: 50`

And member:
- `active: true`
- `registrationFeeContributions: 150`
- `shareCapitalContributions: 0`
- `monthlyMinimumContribution: 0`
- `totalArrears: 30`

Then `computeMemberStatuses()` will:

1. Check `requireActive` (true): member.active (true) ✓ passes
2. Check `requireRegistrationFee` (true): regFee (150 > 0) ✓ passes
3. Skip `requireEligibleContributions` (false): not checked
4. Check `requireNoArrears` (true): arrears (30 ≤ 50) ✓ passes

**Result**: `dividendEligible: true`, `reason: "Eligible: member satisfies all configured dividend criteria"`

If `requireNoArrears: true` but `maxAllowedArrears: 0`, same member would fail check 4 because `30 > 0`.

---

## UI/UX

### System Settings Form

**Location**: Settings (⚙️) → System Settings tab → Scroll to "Dividend Eligibility Criteria" section

**Controls**:

1. **Monthly Contribution Expectation (KES)** — Number input, min 0, step 1
   - Label: "Monthly Contribution Expectation (KES)"
   - Default: 200
   - Validation: Non-negative number

2. **Require Active Member** — Yes/No dropdown
   - Label: "Require Active Member"
   - Default: Yes
   - Effect: If "No", suspended members can have `dividendEligible: true`

3. **Require Registration Fee Paid** — Yes/No dropdown
   - Label: "Require Registration Fee Paid"
   - Default: Yes

4. **Require Eligible Contributions** — Yes/No dropdown
   - Label: "Require Eligible Contributions"
   - Default: Yes
   - Effect: If "No", members with only risk fund or fees can be eligible

5. **Require No Arrears** — Yes/No dropdown
   - Label: "Require No Arrears"
   - Default: Yes

6. **Max Allowed Arrears (KES)** — Number input, min 0, step 0.01
   - Label: "Maximum Allowed Arrears (KES)"
   - Default: 0
   - Only applied if "Require No Arrears" = Yes
   - Validation: Non-negative number

**Save Button**: "💾 Save All Settings" persists entire systemSettings object to localStorage

### Member List Display

**Eligibility Column Cells**:

| Element | Display | Meaning |
|---------|---------|---------|
| Badge | "🟢 Eligible" | Member qualifies for dividend payout |
| Badge | "🔴 Not Eligible" | Member does not meet eligibility criteria |
| Hover Tooltip | Eligibility reason text | Explains which criteria failed (if not eligible) or confirms "satisfies all criteria" if eligible |

**Example Tooltips**:

- "Registration fee not paid" — Missing initial capital gate
- "Member is suspended" — Account suspended
- "No eligible contributions recorded" — Only has risk fund, not share capital/monthly minimum
- "Has contribution arrears above allowed threshold (0.00)" — Owes money
- "Eligible: member satisfies all configured dividend criteria" — All checks passed

### Workflow Example

1. **Admin opens System Settings** → navigates to Dividend Eligibility Criteria section
2. **Admin changes** "Max Allowed Arrears" from 0 to 50 KES
3. **Admin clicks Save** → localStorage updated in browser
4. **Admin navigates to Members** → list automatically refreshes
5. **New API call** includes `dividendMaxAllowedArrears=50` in URL
6. **Backend recalculates** eligibility with new threshold
7. **UI updates**: previously ineligible members with 30 KES arrears are now "🟢 Eligible"

---

## API Reference

### GET /members

Fetches paginated member list with computed eligibility statuses.

#### Query Parameters

| Parameter | Type | Required | Default | Example |
|-----------|------|----------|---------|---------|
| `skip` | number | No | 0 | `skip=0` |
| `take` | number | No | 50 | `take=50` |
| `search` | string | No | nil | `search=John` |
| `role` | string | No | nil | `role=Treasurer` |
| `active` | string | No | nil | `active=true` or `false` |
| `sort` | 'asc' or 'desc' | No | 'desc' | `sort=asc` |
| **`dividendMonthlyInvoiceAmount`** | string (number) | No | undefined | `dividendMonthlyInvoiceAmount=200` |
| **`dividendRequireActive`** | string ('true'/'false') | No | undefined | `dividendRequireActive=true` |
| **`dividendRequireRegistrationFee`** | string ('true'/'false') | No | undefined | `dividendRequireRegistrationFee=true` |
| **`dividendRequireEligibleContributions`** | string ('true'/'false') | No | undefined | `dividendRequireEligibleContributions=true` |
| **`dividendRequireNoArrears`** | string ('true'/'false') | No | undefined | `dividendRequireNoArrears=true` |
| **`dividendMaxAllowedArrears`** | string (number) | No | undefined | `dividendMaxAllowedArrears=0.00` |

#### Example Request

```
GET /members?skip=0&take=50&dividendMonthlyInvoiceAmount=200&dividendRequireActive=true&dividendRequireRegistrationFee=true&dividendRequireEligibleContributions=true&dividendRequireNoArrears=true&dividendMaxAllowedArrears=0
```

#### Response (Member Object)

```typescript
{
  id: number;
  name: string;
  phone: string;
  email?: string;
  active: boolean;
  activityStatus: 'active' | 'suspended';
  
  // Contribution breakdowns
  registrationFeeContributions: number;
  shareCapitalContributions: number;
  monthlyMinimumContribution: number;
  riskFundContributions: number;
  totalContributions: number;
  
  // Arrears tracking
  totalArrears: number;
  
  // Dividend eligibility (COMPUTED at query time)
  dividendEligible: boolean;
  dividendEligibilityStatus: 'eligible' | 'not_eligible';
  dividendPayableStatus: 'payable' | 'not_payable';
  dividendEligibilityReason: string;
  
  // Other fields...
  role?: string;
  indicativeTotalPayout?: number;
  // ... other member fields
}
```

#### Response Example

```json
{
  "data": [
    {
      "id": 1,
      "name": "John Doe",
      "phone": "254712345678",
      "active": true,
      "activityStatus": "active",
      "registrationFeeContributions": 500,
      "shareCapitalContributions": 1000,
      "monthlyMinimumContribution": 2400,
      "riskFundContributions": 300,
      "totalContributions": 4200,
      "totalArrears": 0,
      "dividendEligible": true,
      "dividendEligibilityStatus": "eligible",
      "dividendPayableStatus": "payable",
      "dividendEligibilityReason": "Eligible: member satisfies all configured dividend criteria",
      "role": "Member"
    },
    {
      "id": 2,
      "name": "Jane Smith",
      "phone": "254712345679",
      "active": false,
      "activityStatus": "suspended",
      "registrationFeeContributions": 500,
      "shareCapitalContributions": 500,
      "monthlyMinimumContribution": 800,
      "riskFundContributions": 100,
      "totalContributions": 1900,
      "totalArrears": 0,
      "dividendEligible": false,
      "dividendEligibilityStatus": "not_eligible",
      "dividendPayableStatus": "not_payable",
      "dividendEligibilityReason": "Member is suspended",
      "role": "Member"
    }
  ],
  "total": 150,
  "pages": 3,
  "skip": 0,
  "take": 50
}
```

---

## Audit Trail

### Commit History (Related to Eligibility Feature)

| Commit | Date | Message | Changes |
|--------|------|---------|---------|
| 2ea1f40 | Feb 28, 2026 | Fix continuous row numbering and always-visible top table scrollbar | UI/UX fixes (not eligibility-related) |
| cc23fd8 | Feb 28, 2026 | Unify member activity and dividend eligibility marking | Consolidated rules into backend; fixed contribution scoping |
| 296a9c1 | Feb 28, 2026 | Add dividend eligibility reason tooltip for members | Added dividendEligibilityReason field; UI tooltips |
| 9eb2e91 | Feb 28, 2026 | Make dividend eligibility criteria user-defined via system settings | Parameterized 6 criteria; added Settings UI; wired API flow |

### Files Modified (Current Implementation)

- `backend/src/members/members.service.ts` — Service logic with parameterized criteria
- `backend/src/members/members.controller.ts` — API controller accepting criteria query params
- `frontend/src/pages/SettingsPage.jsx` — UI form for configurable criteria
- `frontend/src/components/members/MembersList.jsx` — Member list reading settings and sending to API

### Testing Checklist

- [ ] Settings persist to localStorage correctly
- [ ] Member list API includes all 6 dividend params in each request
- [ ] Changing "Max Allowed Arrears" to 50 allows arrears ≤ 50 to pass
- [ ] Toggling "Require Active" to "No" makes suspended members eligible
- [ ] Toggling "Require Active" to "Yes" makes suspended members ineligible
- [ ] Eligibility reason tooltips display correct reasons for each failed check
- [ ] Enabling/disabling checks hides/shows those reasons in tooltip
- [ ] API defaults to safe values if criteria params missing
- [ ] Malformed criteria params don't crash backend; uses defaults instead

---

## Summary

The system implements **configurable dividend eligibility** through a clean separation of concerns:

1. **Settings UI** stores policy rules in localStorage
2. **Settings flow** to API as query parameters on each member fetch
3. **Backend normalizes** criteria (merge with defaults, validate types)
4. **Service computes** eligibility by conditionally applying each rule
5. **Response includes** eligibility status + human-readable reason
6. **Frontend displays** status badge and tooltip explaining why

This design ensures:
- ✅ **No database mutations** for policy changes
- ✅ **True flexibility** — rules adapt immediately to configuration
- ✅ **Transparent reasoning** — users know exactly why members are/aren't eligible
- ✅ **Type safety** — both frontend and backend validate criteria parameters
- ✅ **Fallback safety** — system gracefully degrades if settings missing or corrupted
