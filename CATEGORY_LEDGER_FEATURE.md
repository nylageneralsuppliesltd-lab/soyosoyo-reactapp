# Category Ledger System - Feature Documentation

## Overview

The Category Ledger System is a comprehensive financial tracking solution that automatically creates ledger accounts for income and expense categories. When transactions are posted to these ledgers, they automatically affect SACCO's overall financials, providing real-time visibility into organizational finances.

## Key Features

### 1. **Auto-Creation of Ledger Pages**
- When an expense or income category is created in Settings, a corresponding `CategoryLedger` is automatically generated
- Each category gets its own ledger account with:
  - Balance tracking
  - Total amount tracking
  - Complete transaction history (entries)
  - Category type (income/expense) classification

### 2. **Transaction Posting**
- Post debit/credit transactions directly to category ledgers
- Support for multiple transaction types:
  - **Credit**: Increase ledger balance (income in, expenses out)
  - **Debit**: Decrease ledger balance (income out, expenses in)
  - **Transfer**: Move amounts between category ledgers

### 3. **Real-Time Financial Summary**
- Automatic SACCO financial dashboard showing:
  - Total Income (sum of all income category balances)
  - Total Expenses (sum of all expense category balances)
  - Net Result (Income - Expenses)
  - Breakdown by individual categories

### 4. **Ledger Entry Tracking**
- Every transaction creates an immutable `CategoryLedgerEntry` record with:
  - Transaction type (debit/credit/transfer)
  - Amount and resulting balance
  - Description and narration
  - Source type (deposit, withdrawal, manual, invoice, transfer)
  - Date and timestamp
  - Reference numbers for audit trail

## Database Schema

### CategoryLedger Model
```prisma
model CategoryLedger {
  id               Int                    @id @default(autoincrement())
  categoryType     String                 // 'income' or 'expense'
  categoryName     String                 @unique
  expenseCategory  ExpenseCategory?       @relation(...)
  incomeCategory   IncomeCategory?        @relation(...)
  totalAmount      Decimal                // Total of all postings
  balance          Decimal                // Current balance
  entries          CategoryLedgerEntry[]  // All ledger entries
  createdAt        DateTime
  updatedAt        DateTime
}
```

### CategoryLedgerEntry Model
```prisma
model CategoryLedgerEntry {
  id               Int            @id @default(autoincrement())
  categoryLedgerId Int
  categoryLedger   CategoryLedger  @relation(...)
  type             String         // 'debit', 'credit', 'transfer'
  amount           Decimal
  description      String?
  narration        String?
  sourceType       String?        // Source of transaction
  sourceId         String?        // Reference to source
  reference        String?        // Transaction reference
  balanceAfter     Decimal        // Balance after posting
  date             DateTime
  createdAt        DateTime
  updatedAt        DateTime
}
```

### Updated Category Models
```prisma
model ExpenseCategory {
  id              Int
  name            String          @unique
  description     String?
  isAdmin         Boolean
  categoryLedger  CategoryLedger?  @relation("ExpenseCategoryLedger")
  createdAt       DateTime
  updatedAt       DateTime
}

model IncomeCategory {
  id              Int
  name            String          @unique
  description     String?
  categoryLedger  CategoryLedger?  @relation("IncomeCategoryLedger")
  createdAt       DateTime
  updatedAt       DateTime
}
```

## Backend Implementation

### CategoryLedgerService

**Key Methods:**

#### `createCategoryLedger(categoryType, categoryId, categoryName)`
- Auto-called when category is created
- Initializes ledger with 0 balance and amount
- Linked to expense or income category

#### `postTransaction(categoryLedgerId, type, amount, description, sourceType, sourceId, reference, narration)`
- Posts transaction to ledger
- Automatically recalculates balance
- Creates immutable entry record
- Supports: debit, credit, transfer

#### `getCategoryLedger(categoryLedgerId)`
- Returns full ledger with all entries
- Includes category relationship
- Ordered by date descending

#### `getAllCategoryLedgers(type?)`
- Get all ledgers, optionally filtered by 'income' or 'expense'
- Returns last 5 entries for each ledger summary

#### `getSaccoFinancialSummary()`
- Returns overall financial picture:
  - Total income across all income categories
  - Total expenses across all expense categories
  - Net result (profit/loss)
  - Breakdown by individual categories

#### `transferBetweenCategories(fromId, toId, amount, description, reference)`
- Executes double-entry transfer
- Posts debit to source ledger
- Posts credit to destination ledger
- Maintains audit trail with transfer reference

### CategoryLedgerController

**Endpoints:**

- `GET /category-ledgers` - Get all ledgers (optional type filter)
- `GET /category-ledgers/:id` - Get specific ledger with entries
- `GET /category-ledgers/:id/entries?skip=0&take=20` - Paginated entries
- `GET /category-ledgers/summary/sacco` - SACCO financial summary
- `POST /category-ledgers/:id/post-transaction` - Post transaction to ledger
- `POST /category-ledgers/transfer` - Transfer between ledgers

### SettingsService Integration

**Auto-Ledger Creation:**
```typescript
// When creating expense category:
const category = await this.prisma.expenseCategory.create({ data });
await this.categoryLedgerService.createCategoryLedger(
  'expense',
  category.id,
  category.name,
);

// When creating income category:
const category = await this.prisma.incomeCategory.create({ data });
await this.categoryLedgerService.createCategoryLedger(
  'income',
  category.id,
  category.name,
);
```

## Frontend Implementation

### CategoryLedgerPage Component

**Location:** `frontend/src/pages/CategoryLedgerPage.jsx`

**Features:**

#### 1. Summary Dashboard
- Displays total income, expenses, and net result
- Visual cards with color coding (green for income/profit, red for expense/loss)
- Summary table showing all categories with balances

#### 2. Ledgers Tab
- Grid view of all category ledgers
- Filter by category type (All, Income, Expenses)
- Each card shows:
  - Category name with type badge
  - Current balance
  - Total amount
  - Entry count
  - View Details button
- Ledger details modal shows complete transaction history

#### 3. Post Transaction Tab
- Select category ledger
- Choose transaction type (credit/debit/transfer)
- Enter amount and description
- Optional: source type, reference, narration
- Real-time validation

#### 4. Transfer Tab
- Select source and destination ledgers
- Enter transfer amount
- Add description and reference
- Double-entry verified on backend

### CategoryLedgerAPI Helper

**Location:** `frontend/src/utils/categoryLedgerAPI.js`

```javascript
// Fetch all ledgers
const ledgers = await categoryLedgerAPI.getAllLedgers('income');

// Get specific ledger with entries
const ledger = await categoryLedgerAPI.getLedger(ledgerId);

// Get SACCO financial summary
const summary = await categoryLedgerAPI.getSaccoFinancialSummary();

// Post transaction
await categoryLedgerAPI.postTransaction(ledgerId, {
  type: 'credit',
  amount: 1000,
  description: 'Monthly office expenses',
  sourceType: 'manual',
  reference: 'INV-001'
});

// Transfer between ledgers
await categoryLedgerAPI.transferBetweenCategories({
  fromCategoryLedgerId: 1,
  toCategoryLedgerId: 2,
  amount: 500,
  description: 'Budget allocation',
  reference: 'TRF-001'
});
```

## Workflow Examples

### Scenario 1: Creating New Expense Category

1. User navigates to Settings → Expense Categories
2. Creates new category: "Office Supplies"
3. Backend automatically:
   - Creates ExpenseCategory record
   - Triggers CategoryLedgerService.createCategoryLedger('expense', id, 'Office Supplies')
   - Creates CategoryLedger with 0 balance
4. Category appears in CategoryLedger page

### Scenario 2: Recording Office Expense

1. User navigates to Category Ledgers → Post Transaction
2. Selects "Office Supplies" category
3. Posts debit of 5,000 KES
4. Backend:
   - Creates CategoryLedgerEntry (debit, 5000, -5000 balance)
   - Updates CategoryLedger.balance to -5000
   - Updates CategoryLedger.totalAmount
5. SACCO financials updated automatically
6. Expense appears in Office Supplies ledger history

### Scenario 3: Transferring Budget Between Categories

1. User navigates to Category Ledgers → Transfer
2. Selects "Income" category as source (balance: 50,000)
3. Selects "Office Supplies" as destination (balance: -5,000)
4. Enters transfer amount: 10,000
5. Backend executes:
   - Posts DEBIT of 10,000 to Income ledger (new balance: 40,000)
   - Posts CREDIT of 10,000 to Office Supplies ledger (new balance: 5,000)
   - Creates two entries with matching transfer reference
6. SACCO net result recalculated: (40,000 + other income) - (5,000 + other expenses)

## Financial Impact

### How Transactions Affect SACCO Financials

**Income Ledgers:**
- Credit posting → increases ledger balance → increases total income
- Debit posting → decreases ledger balance → decreases total income

**Expense Ledgers:**
- Debit posting → increases expense amount (displayed as positive)
- Credit posting → decreases expense amount

**Net Result Calculation:**
```
Net Result = Sum(All Income Ledger Balances) - Sum(All Expense Ledger Balances)
```

## API Request Examples

### Get SACCO Financial Summary
```bash
GET /api/category-ledgers/summary/sacco

Response:
{
  "totalIncome": "150000.00",
  "totalExpenses": "45000.00",
  "netResult": "105000.00",
  "incomeCategories": [
    {"name": "Member Contributions", "balance": "100000.00", "entries": 25},
    {"name": "Loan Interest", "balance": "50000.00", "entries": 12}
  ],
  "expenseCategories": [
    {"name": "Office Supplies", "balance": "15000.00", "entries": 8},
    {"name": "Staff Salary", "balance": "30000.00", "entries": 4}
  ]
}
```

### Post Transaction
```bash
POST /api/category-ledgers/5/post-transaction

Body:
{
  "type": "debit",
  "amount": 5000,
  "description": "Office supply purchase - Q1",
  "sourceType": "withdrawal",
  "reference": "WTH-001",
  "narration": "Purchased from Stationary Ltd"
}

Response:
{
  "id": 127,
  "categoryLedgerId": 5,
  "type": "debit",
  "amount": 5000,
  "balanceAfter": -5000,
  "description": "Office supply purchase - Q1",
  "sourceType": "withdrawal",
  "sourceId": "WTH-001",
  "date": "2026-01-21T10:30:00Z"
}
```

### Transfer Between Ledgers
```bash
POST /api/category-ledgers/transfer

Body:
{
  "fromCategoryLedgerId": 1,
  "toCategoryLedgerId": 3,
  "amount": 10000,
  "description": "Budget reallocation - January",
  "reference": "TRF-001"
}

Response:
{
  "success": true,
  "amount": "10000"
}
```

## Benefits

1. **Real-Time Visibility**: SACCO financials update instantly as transactions post
2. **Automatic Ledger Creation**: No manual ledger setup needed
3. **Complete Audit Trail**: Every posting is logged with timestamp and source
4. **Double-Entry Support**: Transfers maintain accounting integrity
5. **Category-Based Reporting**: Easy drill-down into specific expense/income areas
6. **Balance Tracking**: Current and historical balances available
7. **Financial Dashboard**: One-click view of organizational health

## Integration Points

The Category Ledger system integrates with:

- **Settings Module**: Auto-creates ledgers when categories are created/updated
- **Deposits/Withdrawals**: Can source transactions from deposit/withdrawal module
- **Reports**: Category ledger data feeds into financial reports and dashboards
- **Dashboard**: SACCO financial summary displayed on main dashboard
- **Invoicing**: Can post invoice-generated income to category ledgers

## Future Enhancements

- Budget tracking (budget vs actual by category)
- Recurring transaction templates
- Category-level permissions
- Export ledger to PDF/Excel
- Advanced filtering and date range reports
- Budget alerts and notifications
- Category consolidation and rollup reporting

## Deployment Notes

**Database Migration:**
```
Migration: 20260121191416_add_category_ledgers
- Creates CategoryLedger table
- Creates CategoryLedgerEntry table
- Updates ExpenseCategory with categoryLedger relation
- Updates IncomeCategory with categoryLedger relation
```

**Backend Service:**
- Deployed CategoryLedgerModule
- Integrated with SettingsModule for auto-creation
- Service methods available for other modules

**Frontend:**
- CategoryLedgerPage component ready for routing
- API helper available for service integration
- Styling included in category-ledger.css
