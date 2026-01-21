# Asset Management System - Feature Documentation

## Overview

The Asset Management System enables SACCO to track all organizational assets with complete lifecycle management from purchase to sale. The system supports buying assets through various payment methods (cash, MPESA, bank accounts) and selling assets with automatic financial tracking, depreciation monitoring, and gain/loss calculations.

## Key Features

### 1. **Asset Purchase (Buying)**
- Record asset acquisitions with complete details
- Select payment account (Cash, MPESA, or Bank Account)
- Automatic balance deduction from selected account
- Asset categories (Equipment, Vehicle, Building, Furniture, Technology, Land)
- Optional depreciation rate configuration
- Purchase price becomes initial current value

### 2. **Asset Sale (Selling)**
- Sell active assets only
- Select receiving account for proceeds (Cash, MPESA, or Bank Account)
- Automatic balance increment to selected account
- Automatic gain/loss calculation (disposal price vs current value)
- Disposal reason tracking
- Status change to "sold" with sale date

### 3. **Asset Tracking & Reporting**
- Real-time asset inventory with status (active, sold, disposed)
- Depreciation tracking and reporting
- Asset summary by category
- Gain/loss from asset sales
- Transaction history for each asset

### 4. **Account Management Integration**
- Seamless integration with existing account system
- Support for multiple account types:
  - **Cash Accounts**: Physical cash management
  - **MPESA Accounts**: Mobile money transactions
  - **Bank Accounts**: Bank deposits/withdrawals

## Database Schema

### Asset Model
```prisma
model Asset {
  id              Int
  name            String              // Asset name (e.g., "Office Computer")
  description     String?             // Detailed description
  category        String              // Equipment, Vehicle, Building, etc.
  
  // Purchase Information
  purchasePrice   Decimal             // Original purchase amount
  purchaseDate    DateTime            // Date of purchase
  purchaseAccount Account?            // Account used for payment
  
  // Current State
  currentValue    Decimal             // Current depreciated value
  depreciationRate Decimal?           // Annual % depreciation
  lastValueUpdate DateTime?           // Last time value was updated
  
  // Disposal Information
  status          String              // 'active', 'sold', 'disposed', 'damaged'
  disposalDate    DateTime?           // Date asset was sold
  disposalPrice   Decimal?            // Sale price
  disposalAccount Account?            // Account receiving sale proceeds
  disposalReason  String?             // Why asset was sold
  
  // Tracking
  transactions    AssetTransaction[]  // All buy/sell transactions
  createdAt       DateTime
  updatedAt       DateTime
}
```

### AssetTransaction Model
```prisma
model AssetTransaction {
  id              Int
  asset           Asset               // Associated asset
  
  type            String              // 'purchase', 'sale', 'depreciation', 'adjustment'
  amount          Decimal             // Transaction amount
  
  // Account Information
  account         Account?            // Associated account (if applicable)
  accountName     String?             // Cached account name
  accountType     String?             // Cached account type (cash, mpesa, bank)
  
  // Details
  description     String?             // What happened
  reference       String?             // Transaction reference
  notes           String?             // Additional notes
  
  // For Sales
  gainLoss        Decimal?            // Profit/loss from sale
  
  date            DateTime
  createdAt       DateTime
  updatedAt       DateTime
}
```

## Backend Implementation

### AssetsService

**Key Methods:**

#### `purchaseAsset(data)`
```typescript
async purchaseAsset({
  name: string;
  description?: string;
  category: string;
  purchasePrice: number;
  purchaseDate: string;  // YYYY-MM-DD
  purchaseAccountId: number;
  depreciationRate?: number;
})
```
- Creates new asset record
- Creates purchase transaction
- Deducts amount from purchase account
- Returns asset and transaction details

#### `sellAsset(data)`
```typescript
async sellAsset({
  assetId: number;
  disposalPrice: number;
  disposalDate: string;  // YYYY-MM-DD
  disposalAccountId: number;
  disposalReason?: string;
})
```
- Updates asset status to "sold"
- Calculates gain/loss (disposal price - current value)
- Creates sale transaction
- Adds proceeds to disposal account
- Returns asset, transaction, and gain/loss

#### `getAssetsSummary()`
Returns aggregate data:
- Total assets count and active/sold breakdown
- Total purchase value, current value, depreciation
- Gain/loss from all sales
- Breakdown by category

#### `getAssetsDepreciation()`
Returns depreciation analysis:
- Depreciated amount and percentage
- Years held since purchase
- Annual depreciation rate
- Current vs. original value

#### `getAllAssets(status?)`
Get assets list with optional status filtering:
- Filter by: active, sold, disposed
- Includes related accounts and recent transactions

### AssetsController

**REST Endpoints:**

```
GET    /assets                           Get all assets
GET    /assets?status=active             Filter by status
GET    /assets/summary                   Asset summary report
GET    /assets/depreciation              Depreciation analysis
GET    /assets/:id                       Get specific asset
GET    /assets/:id/transactions          Get asset transactions

POST   /assets/purchase                  Buy asset
POST   /assets/:id/sell                  Sell asset
PUT    /assets/:id/value                 Update asset value

DELETE /assets/:id                       Delete asset
```

## Frontend Implementation

### AssetsPage Component

**Location:** `frontend/src/pages/AssetsPage.jsx`

**Tabs:**

1. **Assets List**
   - Grid view of all assets
   - Filter by status (All, Active, Sold)
   - Summary cards showing:
     - Total assets and active count
     - Purchase value
     - Current value
     - Total depreciation
     - Gain/loss from sales
   - Table with:
     - Asset name and description
     - Category and purchase price
     - Current value and depreciation
     - Purchase date and account
     - Status badge
     - Sell button (active assets only)

2. **Buy Asset**
   - Asset name and description
   - Category dropdown
   - Purchase price
   - Purchase date
   - **Payment Account selector** (Cash/MPESA/Bank)
   - Optional depreciation rate
   - Automatic account balance deduction

3. **Sell Asset**
   - Asset details display (purchase price, current value)
   - Disposal price
   - Disposal date
   - **Receiving Account selector** (Cash/MPESA/Bank)
   - Disposal reason
   - Gain/loss preview
   - Automatic account balance increment

4. **Depreciation Report**
   - Asset depreciation by category
   - Total purchase and current values
   - Depreciation amounts and percentages

### API Helper

**Location:** `frontend/src/utils/assetsAPI.js`

```javascript
// Get all assets
const assets = await assetsAPI.getAllAssets();
const active = await assetsAPI.getAllAssets('active');

// Get specific asset
const asset = await assetsAPI.getAsset(assetId);

// Get reports
const summary = await assetsAPI.getAssetsSummary();
const depreciation = await assetsAPI.getAssetsDepreciation();

// Purchase asset
await assetsAPI.purchaseAsset({
  name: 'Office Computer',
  category: 'Technology',
  purchasePrice: 100000,
  purchaseDate: '2026-01-21',
  purchaseAccountId: 1,
  depreciationRate: 20,
});

// Sell asset
await assetsAPI.sellAsset(assetId, {
  disposalPrice: 50000,
  disposalDate: '2026-01-21',
  disposalAccountId: 2,
  disposalReason: 'Upgraded equipment',
});
```

## Workflow Examples

### Example 1: Purchasing Office Equipment

1. **Navigate to** Assets → Buy Asset
2. **Enter details:**
   - Name: "Office Copier"
   - Category: Equipment
   - Purchase Price: 500,000 KES
   - Purchase Date: 2026-01-21
   - **Payment Account: Bank Account (ABC Bank)**
   - Depreciation Rate: 15% per year

3. **System performs:**
   - Creates Asset record with initial value = 500,000
   - Creates AssetTransaction (purchase)
   - Deducts 500,000 from ABC Bank balance

4. **Result:** Asset appears in list with status "active"

### Example 2: Selling Depreciated Equipment

1. **Navigate to** Assets → Assets List
2. **Find asset** "Office Copier" (Active, 2 years old, Current Value: 350,000)
3. **Click Sell**
4. **Enter sale details:**
   - Disposal Price: 320,000 KES
   - Disposal Date: 2026-01-21
   - **Receiving Account: MPESA Account**
   - Reason: Equipment reached end of useful life

5. **System performs:**
   - Gain/Loss Preview: -30,000 KES (loss)
   - Updates Asset status to "sold"
   - Creates AssetTransaction (sale) with gain/loss = -30,000
   - Adds 320,000 to MPESA balance

6. **Result:** Asset status changes to "sold" with sale date

### Example 3: Generating Depreciation Report

1. **Navigate to** Assets → Depreciation Report
2. **View by category:**
   - Equipment: 5 assets, Purchase: 1,000,000, Current: 850,000
   - Vehicles: 2 assets, Purchase: 3,000,000, Current: 2,400,000
   - Technology: 8 assets, Purchase: 800,000, Current: 520,000

3. **Analyze depreciation patterns** by category and asset age

## Financial Impact

### Asset Purchase
- **Reduces** selected account balance
- Creates **Asset** on balance sheet
- No income/expense impact (capitalized)

### Asset Sale
- **Increases** receiving account balance with sale proceeds
- **Removes** asset from active assets
- Creates **Gain or Loss**:
  - **Gain**: If disposal price > current value
  - **Loss**: If disposal price < current value
- Gain/loss can be categorized as income/expense

### Depreciation Tracking
- Annual depreciation rate applied
- Current value = Purchase price - accumulated depreciation
- Used in financial statements and net worth calculations

## Integration Points

The Asset Management System integrates with:

- **Accounts Module**: Validates accounts, updates balances
- **Category Ledgers**: Can post gain/loss to income/expense categories
- **Dashboard**: Asset summary displays on financial overview
- **Reports**: Asset data included in financial reports
- **Audit Logs**: All asset transactions recorded

## API Request Examples

### Purchase Asset
```bash
POST /api/assets/purchase

Body:
{
  "name": "Office Computer",
  "description": "Dell Laptop for accounting department",
  "category": "Technology",
  "purchasePrice": 150000,
  "purchaseDate": "2026-01-21",
  "purchaseAccountId": 2,
  "depreciationRate": 25
}

Response:
{
  "asset": {
    "id": 5,
    "name": "Office Computer",
    "purchasePrice": 150000,
    "currentValue": 150000,
    "status": "active",
    "purchaseAccount": { "id": 2, "name": "Bank Account A" }
  },
  "transaction": {
    "id": 12,
    "type": "purchase",
    "amount": 150000,
    "reference": "ASSET-PURCHASE-5"
  }
}
```

### Sell Asset
```bash
POST /api/assets/5/sell

Body:
{
  "disposalPrice": 80000,
  "disposalDate": "2026-01-21",
  "disposalAccountId": 1,
  "disposalReason": "Upgraded equipment"
}

Response:
{
  "asset": {
    "id": 5,
    "status": "sold",
    "disposalPrice": 80000,
    "disposalDate": "2026-01-21"
  },
  "transaction": {
    "id": 13,
    "type": "sale",
    "amount": 80000,
    "gainLoss": -70000
  },
  "gainLoss": -70000
}
```

### Get Assets Summary
```bash
GET /api/assets/summary

Response:
{
  "totalAssets": 15,
  "activeAssets": 12,
  "soldAssets": 3,
  "totalPurchaseValue": 5000000,
  "totalCurrentValue": 4200000,
  "totalDisposalValue": 1500000,
  "totalGainLoss": -300000,
  "byCategory": {
    "Equipment": {
      "count": 8,
      "purchaseValue": 2000000,
      "currentValue": 1700000,
      "active": 7,
      "sold": 1
    },
    "Vehicles": {
      "count": 4,
      "purchaseValue": 2500000,
      "currentValue": 2000000,
      "active": 3,
      "sold": 1
    }
  }
}
```

## Database Operations

### Manual Asset Creation (Advanced)
```typescript
// Create asset directly
const asset = await prisma.asset.create({
  data: {
    name: 'Asset Name',
    category: 'Equipment',
    purchasePrice: new Decimal('100000'),
    purchaseDate: new Date('2026-01-21'),
    currentValue: new Decimal('100000'),
    status: 'active',
  },
});

// Create transaction
await prisma.assetTransaction.create({
  data: {
    assetId: asset.id,
    type: 'purchase',
    amount: new Decimal('100000'),
    accountId: 1,
    description: 'Purchased asset',
  },
});
```

### Query Assets
```typescript
// Get all active assets with accounts
const activeAssets = await prisma.asset.findMany({
  where: { status: 'active' },
  include: {
    purchaseAccount: true,
    transactions: { take: 5, orderBy: { date: 'desc' } },
  },
});

// Get sold assets with gain/loss
const soldAssets = await prisma.asset.findMany({
  where: { status: 'sold' },
  include: {
    transactions: { where: { type: 'sale' } },
  },
});

// Total value by category
const byCategory = await prisma.asset.groupBy({
  by: ['category'],
  _sum: {
    currentValue: true,
  },
  where: { status: 'active' },
});
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Account balance incorrect | Verify purchase/disposal account ID; check account exists |
| Cannot sell active asset | Asset status must be 'active'; inactive assets can't be sold |
| Depreciation not showing | Verify depreciationRate is set during purchase |
| Gain/loss incorrect | Check current value is accurate; loss = disposal price - current value |

## Future Enhancements

- Bulk asset import/export
- Asset location tracking (branch, department)
- Maintenance schedule and cost tracking
- Asset insurance management
- Depreciation calculation methods (straight-line, declining-balance)
- Asset transfer between departments
- Barcode/QR code scanning
- Photo attachment for assets
- Automated depreciation application
