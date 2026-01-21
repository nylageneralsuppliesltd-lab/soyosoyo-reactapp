# Deposits Module - Implementation Guide

## Overview
The Deposits Module is a comprehensive payment recording and bulk import system with full double-entry bookkeeping integration, ledger posting, and multiple payment type support.

## Features

### 1. **Record Individual Payments**
- Single payment form with member search and selection
- Support for 5 payment types: Contributions, Fines, Loan Repayments, Income, Miscellaneous
- Multiple payment methods: Cash, Bank, M-Pesa, Check-off, Bank Deposit, Other
- Automatic double-entry bookkeeping with account posting
- Optional account selection (defaults to Cashbox)
- Reference numbers and notes for transaction tracking

### 2. **Bulk Import Payments**
- JSON file upload with validation
- Batch processing of multiple payments (up to bulk limits)
- Comprehensive error reporting with row-level details
- Progress tracking (X of Y records processed)
- Template download for correct formatting

### 3. **Double-Entry Bookkeeping**
Each payment is automatically posted to the general ledger as a double-entry:
- **Contribution**: DR Cashbox, CR Member Contributions Received
- **Fine**: DR Cashbox, CR Fines & Penalties (income)
- **Loan Repayment**: DR Cashbox, CR Loans Receivable
- **Income**: DR Cashbox, CR Other Income
- **Miscellaneous**: DR Cashbox, CR Miscellaneous Receipts

### 4. **Ledger Posting**
Each payment creates:
- **JournalEntry**: Audit trail with debit/credit amounts
- **Account Balance Updates**: Both debit and credit accounts updated
- **Category Ledger Entries**: For income and category tracking
- **Member Balance Update**: Personal member ledger entry
- **Financial Reports**: Real-time balance calculation

### 5. **List & Filter**
- View all deposits with responsive table
- Filter by payment type
- Search by member name or reference
- Summary statistics (total deposits, count, amounts)
- Date-sorted entries

## Architecture

### Frontend Components

#### `DepositsPage.jsx` (Container)
- Main page layout with submenu navigation
- Tab switching between Record, Bulk Import, and List views
- Deposit list fetching and filtering
- Success/error state management

#### `DepositPaymentForm.jsx` (Record Payment)
- Single payment form component
- Real-time member search dropdown
- Payment type selector with conditional fields
- Account selection
- Form validation
- API integration with `/deposits/bulk/import-json`

#### `BulkPaymentImport.jsx` (Bulk Import)
- JSON file upload interface
- File validation and parsing
- Error handling with detailed messages
- Result display with success/failure counts
- Template download functionality

### Backend Services

#### `deposits.service.ts`
**Interfaces:**
- `BulkPaymentRecord`: Single payment record structure
- `BulkImportResult`: Import result with success/error counts

**Key Methods:**
- `processBulkPayments()`: Main bulk processing pipeline
- `processPayment()`: Single payment processing with validation
- `postDoubleEntryBookkeeping()`: Core double-entry logic
- `updateCategoryLedger()`: Category ledger posting
- `ensureAccount()` / `ensureAccountByName()`: Account lookup/creation

#### `deposits.controller.ts`
**Endpoints:**
- `POST /deposits` - Create single deposit
- `GET /deposits` - List all deposits with pagination
- `GET /deposits/member/:memberId` - Member deposits
- `GET /deposits/:id` - Single deposit details
- `PATCH /deposits/:id` - Update deposit
- `DELETE /deposits/:id` - Remove deposit
- `POST /deposits/bulk/import-json` - Bulk import
- `GET /deposits/bulk/template` - Import template

### Database Models
- **Deposit**: Payment records with member, amount, type, method
- **JournalEntry**: Accounting entries (debit/credit)
- **Account**: General ledger accounts with balances
- **CategoryLedger**: Income category tracking
- **Member**: Member balance and personal ledger
- **Ledger**: Transaction history per member

## API Documentation

### POST /deposits/bulk/import-json
**Request Body:**
```json
{
  "payments": [
    {
      "date": "2026-01-22",
      "memberName": "John Doe",
      "memberId": 1,
      "amount": 5000,
      "paymentType": "contribution",
      "contributionType": "Monthly Savings",
      "paymentMethod": "cash",
      "accountId": 1,
      "reference": "REF-001",
      "notes": "Member payment"
    }
  ]
}
```

**Response:**
```json
{
  "successful": 98,
  "failed": 2,
  "errors": [
    {
      "row": 3,
      "message": "Member 'Unknown' not found"
    },
    {
      "row": 5,
      "message": "Amount must be > 0"
    }
  ],
  "createdIds": [1, 2, 3, ...]
}
```

### Field Validation
- **date**: Required, ISO 8601 format (YYYY-MM-DD)
- **memberName**: Required, member lookup key
- **amount**: Required, must be > 0
- **paymentType**: Required, one of 5 types
- **paymentMethod**: Required, one of 6 methods
- **contributionType**: Optional, custom contribution name
- **accountId**: Optional, defaults to Cashbox
- **reference**: Optional, max 50 chars
- **notes**: Optional, max 500 chars

## Payment Types & Account Mapping

| Payment Type | Debit Account | Credit Account | Purpose |
|---|---|---|---|
| **contribution** | Cashbox | Member Contributions Received | Member share deposits |
| **fine** | Cashbox | Fines & Penalties | Disciplinary fines (income) |
| **loan_repayment** | Cashbox | Loans Receivable | Loan repayment received |
| **income** | Cashbox | Other Income | Non-member income |
| **miscellaneous** | Cashbox | Miscellaneous Receipts | Other receipts |

## Payment Methods
- **cash**: Physical currency
- **bank**: Bank transfer
- **mpesa**: Mobile money (M-Pesa)
- **check_off**: Salary deduction
- **bank_deposit**: Bank deposit slip
- **other**: Other methods

## User Interface

### Responsive Design
- **Desktop**: Multi-column forms, full table display
- **Tablet**: Stacked form fields, scrollable table
- **Mobile**: Single-column forms, card-based table

### Styling
- Primary color: #4a90e2 (blue)
- Success: #15803d (green)
- Error: #991b1b (red)
- Warning: #78350f (orange)
- Neutral: #666 (gray)

### Key UI Elements
- Form groups with labeled inputs
- Member search dropdown with auto-complete
- Alert messages (success/error)
- Loading spinners
- Empty state messaging
- Summary statistics cards

## Error Handling

### Frontend
- Form validation (required fields, amount > 0)
- API error responses with user messages
- Try-catch blocks with console logging
- Alert dismissal after 5 seconds

### Backend
- BadRequestException for invalid input
- HttpException for processing errors
- Transaction rollback on failure
- Detailed error messages in logs

## Testing Checklist

- [ ] Record single payment with contribution type
- [ ] Record payment with custom contribution type
- [ ] Record fine payment
- [ ] Record loan repayment
- [ ] Record income payment
- [ ] Record miscellaneous payment
- [ ] Test all payment methods
- [ ] Bulk import 10+ payments
- [ ] Verify double-entry posting (debit = credit)
- [ ] Check account balance updates
- [ ] Verify member balance updates
- [ ] Test member search functionality
- [ ] Filter deposits by type
- [ ] Search deposits by reference
- [ ] Verify error handling for invalid data
- [ ] Check ledger entries created
- [ ] Test CSV template download
- [ ] Verify mobile responsiveness

## File Structure
```
frontend/
  src/
    components/
      deposits/
        DepositsPage.jsx           # Main container
        DepositPaymentForm.jsx     # Record form
        BulkPaymentImport.jsx      # Bulk upload
    styles/
      deposits.css                # All deposits styling
    pages/
      DepositsPage.jsx            # Page wrapper

backend/
  src/
    deposits/
      deposits.controller.ts      # API endpoints
      deposits.service.ts         # Business logic
      deposits.module.ts          # NestJS module
```

## Environment Setup

### Frontend
```bash
npm install lucide-react  # Icons (already included)
```

### Backend
```bash
npm install @nestjs/common @nestjs/platform-express
# For bulk upload support
```

## Next Steps

1. **Testing**: Run comprehensive tests for all payment types
2. **Integration**: Connect to member and account APIs
3. **Reports**: Add deposit reconciliation reports
4. **Analytics**: Create deposit trend analysis
5. **Notifications**: Add SMS/email confirmations for bulk imports
6. **Audit Trail**: Log all payment modifications

## Support

For issues or questions:
1. Check error logs in browser console (Ctrl+Shift+I)
2. Review server logs in terminal
3. Verify database connectivity
4. Ensure all required fields are populated
5. Check date format (YYYY-MM-DD)

## Performance Notes

- Bulk import limited by backend timeout (usually 30-60 seconds)
- Recommended batch size: 100-500 records per import
- Database indexes on: memberName, paymentType, date
- Caching disabled for real-time data

## Security

- Form validation on frontend and backend
- SQL injection prevention via Prisma ORM
- No sensitive data in logs
- API endpoints require authentication (to be added)
- Audit trail for all modifications
