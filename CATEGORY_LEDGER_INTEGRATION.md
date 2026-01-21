# Category Ledger System - Integration Guide

## Quick Start

### For End Users

1. **Navigate to Settings** → **Expense/Income Categories**
2. **Create a new category** (e.g., "Office Rent", "Member Contributions")
3. **A ledger is automatically created** with the same name
4. **Navigate to Category Ledgers** page to:
   - View all category ledgers in a grid
   - See real-time balances and entry counts
   - Post transactions to individual ledgers
   - Transfer amounts between categories
   - View complete transaction history

### For Developers

#### Importing and Using CategoryLedgerService

```typescript
// In your module
import { CategoryLedgerModule } from './category-ledger/category-ledger.module';

@Module({
  imports: [CategoryLedgerModule],
})
export class YourModule {}
```

#### Injecting into Services

```typescript
import { CategoryLedgerService } from './category-ledger/category-ledger.service';

@Injectable()
export class YourService {
  constructor(
    private categoryLedgerService: CategoryLedgerService,
  ) {}

  async processTransaction() {
    // Post transaction to ledger
    const entry = await this.categoryLedgerService.postTransaction(
      ledgerId,
      'credit',
      1000,
      'Monthly contribution',
      'deposit',
      'DEPOSIT-001',
    );
  }
}
```

#### Using the Frontend API

```javascript
// In your React component
import categoryLedgerAPI from '../utils/categoryLedgerAPI';

// Get all ledgers
const ledgers = await categoryLedgerAPI.getAllLedgers();

// Get specific ledger
const ledger = await categoryLedgerAPI.getLedger(ledgerId);

// Get financial summary
const summary = await categoryLedgerAPI.getSaccoFinancialSummary();

// Post transaction
await categoryLedgerAPI.postTransaction(ledgerId, {
  type: 'credit',
  amount: 5000,
  description: 'Transaction details',
  sourceType: 'deposit',
  reference: 'REF-001',
});
```

## Common Integration Scenarios

### Scenario 1: Auto-Post Deposits to Category Ledgers

**Use Case**: When a member makes a deposit, automatically post to relevant income category.

**Implementation**:

```typescript
// In deposits.service.ts
import { CategoryLedgerService } from '../category-ledger/category-ledger.service';

@Injectable()
export class DepositsService {
  constructor(
    private categoryLedgerService: CategoryLedgerService,
  ) {}

  async createDeposit(data: CreateDepositDto) {
    // Create deposit record
    const deposit = await this.prisma.deposit.create({ data });

    // Post to income category ledger
    if (deposit.category) {
      const ledger = await this.categoryLedgerService.getCategoryLedgerByName(
        deposit.category,
      );
      if (ledger) {
        await this.categoryLedgerService.postTransaction(
          ledger.id,
          'credit',
          deposit.amount,
          `Deposit from ${deposit.memberName}`,
          'deposit',
          deposit.id.toString(),
          deposit.reference,
        );
      }
    }

    return deposit;
  }
}
```

### Scenario 2: Auto-Post Withdrawals to Expense Categories

**Use Case**: When a withdrawal is made, post to relevant expense category.

```typescript
// In withdrawals.service.ts
async createWithdrawal(data: CreateWithdrawalDto) {
  const withdrawal = await this.prisma.withdrawal.create({ data });

  // Post to expense category ledger
  if (withdrawal.category) {
    const ledger = await this.categoryLedgerService.getCategoryLedgerByName(
      withdrawal.category,
    );
    if (ledger) {
      await this.categoryLedgerService.postTransaction(
        ledger.id,
        'debit',
        withdrawal.amount,
        `Withdrawal: ${withdrawal.purpose}`,
        'withdrawal',
        withdrawal.id.toString(),
        withdrawal.reference,
      );
    }
  }

  return withdrawal;
}
```

### Scenario 3: Monthly Financial Report

**Use Case**: Generate monthly report showing financial performance by category.

```typescript
// In reports.service.ts
async getMonthlyFinancialReport(month: number, year: number) {
  const summary = await this.categoryLedgerService.getSaccoFinancialSummary();

  // Get ledgers with entries for specific month
  const ledgers = await this.categoryLedgerService.getAllCategoryLedgers();

  const filteredEntries = ledgers.map((ledger) => ({
    category: ledger.categoryName,
    type: ledger.categoryType,
    balance: ledger.balance,
    entries: ledger.entries.filter(
      (e) => e.date.getMonth() === month && e.date.getFullYear() === year,
    ),
  }));

  return {
    period: `${month}/${year}`,
    summary,
    categoryBreakdown: filteredEntries,
  };
}
```

### Scenario 4: Dashboard Widget

**Use Case**: Display financial summary on main dashboard.

```jsx
// In DashboardPage.jsx
import { useEffect, useState } from 'react';
import categoryLedgerAPI from '../utils/categoryLedgerAPI';

export default function FinancialSummaryWidget() {
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    async function loadSummary() {
      const data = await categoryLedgerAPI.getSaccoFinancialSummary();
      setSummary(data);
    }
    loadSummary();
  }, []);

  if (!summary) return <div>Loading...</div>;

  return (
    <div className="financial-summary">
      <h3>SACCO Financial Overview</h3>
      <div className="summary-grid">
        <div className="card income">
          <span>Total Income</span>
          <h4>KES {parseFloat(summary.totalIncome).toLocaleString()}</h4>
        </div>
        <div className="card expense">
          <span>Total Expenses</span>
          <h4>KES {parseFloat(summary.totalExpenses).toLocaleString()}</h4>
        </div>
        <div className="card net">
          <span>Net Result</span>
          <h4>KES {parseFloat(summary.netResult).toLocaleString()}</h4>
        </div>
      </div>
    </div>
  );
}
```

## Database Operations

### Manual Ledger Entry Creation (Direct Database)

```typescript
// Create a ledger entry directly
const entry = await prisma.categoryLedgerEntry.create({
  data: {
    categoryLedgerId: 1,
    type: 'credit',
    amount: new Decimal('5000'),
    description: 'Manual adjustment',
    balanceAfter: new Decimal('25000'),
  },
});

// Update ledger balance (be careful with this!)
await prisma.categoryLedger.update({
  where: { id: 1 },
  data: {
    balance: new Decimal('30000'),
    totalAmount: new Decimal('100000'),
  },
});
```

### Querying Ledger Data

```typescript
// Get all income ledgers with recent entries
const incomeWithEntries = await prisma.categoryLedger.findMany({
  where: { categoryType: 'income' },
  include: {
    entries: {
      orderBy: { date: 'desc' },
      take: 10,
    },
  },
});

// Get expense ledgers for a date range
const expenseEntries = await prisma.categoryLedgerEntry.findMany({
  where: {
    categoryLedger: { categoryType: 'expense' },
    date: {
      gte: new Date('2026-01-01'),
      lte: new Date('2026-01-31'),
    },
  },
  orderBy: { date: 'desc' },
});

// Get ledger balance for a specific date
const historicalBalance = await prisma.categoryLedgerEntry.findMany({
  where: {
    categoryLedgerId: 1,
    date: { lte: new Date('2026-01-15') },
  },
  orderBy: { date: 'desc' },
  take: 1,
});
```

## Error Handling

```typescript
try {
  const entry = await categoryLedgerService.postTransaction(
    ledgerId,
    'credit',
    1000,
    'Transaction',
    'source_type',
  );
} catch (error) {
  if (error.message.includes('not found')) {
    // Handle ledger not found
    console.error('Ledger not found');
  } else {
    // Handle other errors
    console.error('Failed to post transaction:', error);
  }
}
```

## Performance Considerations

### Pagination for Large Ledgers

```typescript
// For ledgers with many entries, paginate
const page = 1;
const pageSize = 50;

const entries = await categoryLedgerService.getCategoryLedgerEntries(
  ledgerId,
  (page - 1) * pageSize,
  pageSize,
);
```

### Caching Summary (Recommended)

```typescript
// Cache SACCO financial summary for 5 minutes
const CACHE_KEY = 'sacco_summary';
const CACHE_TTL = 300000; // 5 minutes

async function getCachedSummary() {
  const cached = await cache.get(CACHE_KEY);
  if (cached) return cached;

  const summary =
    await categoryLedgerService.getSaccoFinancialSummary();
  await cache.set(CACHE_KEY, summary, CACHE_TTL);
  return summary;
}
```

## Testing

### Unit Test Example

```typescript
describe('CategoryLedgerService', () => {
  let service: CategoryLedgerService;

  beforeEach(() => {
    service = new CategoryLedgerService(mockPrisma);
  });

  it('should post transaction and update balance', async () => {
    const result = await service.postTransaction(
      1,
      'credit',
      1000,
      'Test transaction',
      'test',
    );

    expect(result.amount).toBe(1000);
    expect(result.type).toBe('credit');
  });

  it('should transfer between ledgers', async () => {
    const result = await service.transferBetweenCategories(
      1,
      2,
      500,
      'Test transfer',
    );

    expect(result.success).toBe(true);
  });
});
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Ledger not found when posting | Ensure category ledger exists; check categoryName matches |
| Negative balance unexpected | Verify transaction type (credit increases, debit decreases) |
| Entries not showing | Check date range; ensure entries were created successfully |
| Summary not updating | Clear cache if implemented; reload page |
| Transfer failing | Ensure both ledger IDs are valid; check amount is positive |

## API Endpoint Reference

```bash
# Get all ledgers
GET /api/category-ledgers

# Get all income ledgers
GET /api/category-ledgers?type=income

# Get specific ledger
GET /api/category-ledgers/1

# Get ledger entries (paginated)
GET /api/category-ledgers/1/entries?skip=0&take=20

# Get SACCO financial summary
GET /api/category-ledgers/summary/sacco

# Post transaction
POST /api/category-ledgers/1/post-transaction
{
  "type": "credit",
  "amount": 5000,
  "description": "Transaction",
  "sourceType": "deposit",
  "reference": "REF-001"
}

# Transfer between ledgers
POST /api/category-ledgers/transfer
{
  "fromCategoryLedgerId": 1,
  "toCategoryLedgerId": 2,
  "amount": 1000,
  "description": "Transfer"
}
```

## Next Steps

1. **Route Integration**: Add CategoryLedgerPage to your routing
2. **API Integration**: Hook deposits/withdrawals to category ledger posting
3. **Dashboard Integration**: Display financial summary on main dashboard
4. **Report Integration**: Use category ledger data in financial reports
5. **Notifications**: Set up alerts for budget thresholds

---

For detailed information, see [CATEGORY_LEDGER_FEATURE.md](CATEGORY_LEDGER_FEATURE.md)
