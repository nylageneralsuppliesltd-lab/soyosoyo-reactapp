# Deposits Module - System Architecture

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                          USER INTERFACE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  │ Record Payment   │  │  Bulk Import     │  │  List Deposits   │
│  │ Form Component   │  │  File Upload     │  │  Table & Filters │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
│           │                     │                     │
│           └─────────────────────┼─────────────────────┘
│                                 │
│                          DepositsPage
│                          (Container)
│                                 │
└─────────────────────────────────┼─────────────────────────────────┘
                                  │
                    ┌─────────────▼──────────────┐
                    │   API Endpoints            │
                    ├───────────────────────────┤
                    │ • POST /deposits          │
                    │ • POST /deposits/bulk/*   │
                    │ • GET /deposits           │
                    │ • GET /deposits/:id       │
                    │ • PATCH /deposits/:id     │
                    │ • DELETE /deposits/:id    │
                    └─────────────┬──────────────┘
                                  │
┌─────────────────────────────────▼──────────────────────────────────┐
│                     BACKEND (NestJS)                                 │
├────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │            DepositsService                                   │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │                                                              │   │
│  │  1. processBulkPayments()                                   │   │
│  │     └─> Loop through payment records                       │   │
│  │                                                              │   │
│  │  2. processPayment()                                        │   │
│  │     └─> Validate payment data                             │   │
│  │     └─> Look up member                                    │   │
│  │     └─> Create deposit record                            │   │
│  │     └─> Call postDoubleEntryBookkeeping()                │   │
│  │                                                              │   │
│  │  3. postDoubleEntryBookkeeping()                            │   │
│  │     └─> Determine accounts based on payment type          │   │
│  │     └─> Create JournalEntry (DR & CR)                     │   │
│  │     └─> Update account balances                           │   │
│  │     └─> Call updateCategoryLedger()                       │   │
│  │     └─> Update member balance                             │   │
│  │     └─> Create member ledger entry                        │   │
│  │                                                              │   │
│  │  4. updateCategoryLedger()                                  │   │
│  │     └─> Post income to category ledger                    │   │
│  │                                                              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │
                    ┌──────────────▼───────────────┐
                    │    Database (PostgreSQL)      │
                    ├──────────────────────────────┤
                    │ • Deposit                    │
                    │ • Account                    │
                    │ • JournalEntry               │
                    │ • CategoryLedger             │
                    │ • CategoryLedgerEntry        │
                    │ • Member                     │
                    │ • Ledger                     │
                    └──────────────────────────────┘
```

## Payment Type Processing Flow

```
┌─────────────────┐
│  New Payment    │
└────────┬────────┘
         │
         ▼
    ┌─────────────────────────────────────────┐
    │  Is payment type?                        │
    ├─────────────────────────────────────────┤
    │                                         │
    ├─► Contribution                         │
    │   ├─► DR: Cashbox                      │
    │   ├─► CR: Member Contributions Received│
    │   └─► Update member balance (+)        │
    │                                         │
    ├─► Fine                                 │
    │   ├─► DR: Cashbox                      │
    │   ├─► CR: Fines & Penalties (Income)  │
    │   └─► Post to category ledger         │
    │                                         │
    ├─► Loan Repayment                       │
    │   ├─► DR: Cashbox                      │
    │   ├─► CR: Loans Receivable             │
    │   └─► Update loan balance              │
    │                                         │
    ├─► Income                               │
    │   ├─► DR: Cashbox                      │
    │   ├─► CR: Other Income                 │
    │   └─► Post to category ledger         │
    │                                         │
    └─► Miscellaneous                        │
        ├─► DR: Cashbox                      │
        ├─► CR: Miscellaneous Receipts       │
        └─► Post to category ledger         │
```

## Double-Entry Bookkeeping Example

### Transaction: Member contribution of 5,000 KES (cash)

```
┌─────────────────────────────────────────────────────┐
│            JournalEntry Created                      │
├─────────────────────────────────────────────────────┤
│                                                      │
│ Entry ID: 123                                       │
│ Date: 2026-01-22                                   │
│ Reference: Member contribution - John Doe          │
│                                                      │
│ ┌────────────────────────────────────────────────┐ │
│ │ Debit Entry                                    │ │
│ ├────────────────────────────────────────────────┤ │
│ │ Account: Cashbox                              │ │
│ │ Amount: 5,000.00 KES                          │ │
│ │ Description: Contribution received - John Doe │ │
│ └────────────────────────────────────────────────┘ │
│                                                      │
│ ┌────────────────────────────────────────────────┐ │
│ │ Credit Entry                                   │ │
│ ├────────────────────────────────────────────────┤ │
│ │ Account: Member Contributions Received         │ │
│ │ Amount: 5,000.00 KES                          │ │
│ │ Description: Member contribution equity       │ │
│ └────────────────────────────────────────────────┘ │
│                                                      │
│ Total Debits: 5,000.00                             │
│ Total Credits: 5,000.00                            │
│ Status: BALANCED ✓                                 │
│                                                      │
└─────────────────────────────────────────────────────┘

        │
        │ Postings
        ▼

┌──────────────────────────────────────────┐
│        Account Balances Updated          │
├──────────────────────────────────────────┤
│                                          │
│ Cashbox:                                 │
│  Before: 50,000.00 KES                  │
│  Debit:  +5,000.00 KES                  │
│  After:  55,000.00 KES ✓               │
│                                          │
│ Member Contributions Received:           │
│  Before: 100,000.00 KES                 │
│  Credit: +5,000.00 KES                  │
│  After:  105,000.00 KES ✓              │
│                                          │
└──────────────────────────────────────────┘

        │
        │ Member Ledger Updates
        ▼

┌──────────────────────────────────────────┐
│         Member (John Doe) Updated        │
├──────────────────────────────────────────┤
│                                          │
│ Member ID: 5                             │
│ Previous Balance: 10,000.00 KES         │
│ Contribution: +5,000.00 KES             │
│ New Balance: 15,000.00 KES ✓           │
│                                          │
│ Ledger Entry Created:                    │
│  Type: Contribution                      │
│  Amount: 5,000.00 KES                   │
│  Reference: REF-12345                    │
│  Date: 2026-01-22                       │
│  Status: Posted ✓                        │
│                                          │
└──────────────────────────────────────────┘
```

## Payment Recording Flow

```
START
  │
  ▼
┌──────────────────────────┐
│ User Form Submission     │
├──────────────────────────┤
│ • Date                   │
│ • Member Name/ID         │
│ • Amount                 │
│ • Payment Type           │
│ • Payment Method         │
│ • (Optional) Account     │
│ • (Optional) Reference   │
│ • (Optional) Notes       │
└──────────┬───────────────┘
           │
           ▼
     ┌─────────────────┐
     │  Validate Data  │
     ├─────────────────┤
     │ • Amount > 0?   │
     │ • Member exists?│
     │ • Date valid?   │
     └────────┬────────┘
              │
       ┌──────┴──────┐
       │             │
       ▼ Valid       ▼ Invalid
    ┌─────┐      ┌─────┐
    │ OK  │      │ERROR│
    └──┬──┘      └─────┘
       │
       ▼
┌──────────────────────────┐
│ Create Deposit Record    │
├──────────────────────────┤
│ INSERT INTO deposits     │
│ VALUES (...)             │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│ Post Double-Entry        │
├──────────────────────────┤
│ 1. Determine accounts    │
│ 2. Create journal entry  │
│ 3. Update balances       │
│ 4. Update ledgers        │
│ 5. Update member balance │
└──────────┬───────────────┘
           │
           ▼
┌──────────────────────────┐
│ Return Success Response  │
├──────────────────────────┤
│ • Deposit ID             │
│ • Amount                 │
│ • Posting date           │
│ • Status: Complete       │
└──────────┬───────────────┘
           │
           ▼
         END
```

## System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React)                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  DepositsPage (Container)                                   │
│  ├── DepositPaymentForm (Single Record)                    │
│  ├── BulkPaymentImport (CSV Upload)                        │
│  └── DepositsTable (List & Filters)                        │
│                                                              │
│  Styling: deposits.css (650+ lines)                        │
│  Icons: lucide-react                                        │
│  Routing: /deposits (3 tabs)                               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                           │
         ┌─────────────────▼──────────────────┐
         │    REST API (JSON over HTTP)       │
         ├────────────────────────────────────┤
         │ • POST /deposits                   │
         │ • POST /deposits/bulk/import-json  │
         │ • GET /deposits                    │
         │ • GET /deposits/:id                │
         │ • PATCH /deposits/:id              │
         │ • DELETE /deposits/:id             │
         │ • GET /deposits/bulk/template      │
         └────────────────┬───────────────────┘
                          │
┌─────────────────────────▼──────────────────────────────────┐
│                 Backend (NestJS 10.3)                       │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  DepositsController                                          │
│  ├── POST /deposits → create()                             │
│  ├── GET /deposits → findAll()                             │
│  ├── POST /deposits/bulk/import-json → bulkImportJson()   │
│  └── GET /deposits/bulk/template → getBulkTemplate()      │
│                                                               │
│  DepositsService                                             │
│  ├── create()                                               │
│  ├── processBulkPayments()                                  │
│  ├── processPayment()                                       │
│  ├── postDoubleEntryBookkeeping()                          │
│  ├── updateCategoryLedger()                                │
│  └── Helper methods                                         │
│                                                               │
│  Prisma ORM (Type-safe database access)                    │
│                                                               │
└─────────────────────────────┬────────────────────────────────┘
                              │
         ┌────────────────────▼─────────────────────┐
         │    PostgreSQL Database (Neon)            │
         ├──────────────────────────────────────────┤
         │ • deposits table                         │
         │ • accounts table                         │
         │ • journal_entries table                  │
         │ • category_ledgers table                 │
         │ • members table (existing)               │
         │ • ledger table (existing)                │
         └──────────────────────────────────────────┘
```

## Error Handling Flow

```
┌─────────────────────────┐
│   Payment Submitted     │
└────────────┬────────────┘
             │
    ┌────────▼─────────┐
    │  Validation      │
    │  Checks          │
    └────┬──────────┬──┘
         │          │
       Valid    Invalid
         │          │
         │          ▼
         │    ┌────────────────────┐
         │    │ Collect Errors     │
         │    │ ┌────────────────┐ │
         │    │ │ • Row number   │ │
         │    │ │ • Field name   │ │
         │    │ │ • Error message│ │
         │    │ │ • Expected val │ │
         │    │ └────────────────┘ │
         │    └────────┬───────────┘
         │             │
         │             ▼
         │    ┌──────────────────────┐
         │    │ Return Error Array   │
         │    │ HTTP 400 Bad Request │
         │    └──────────┬───────────┘
         │              │
         │              ▼
         │         ┌────────────────┐
         │         │ Display in UI  │
         │         │ Alert (Red)    │
         │         │ - Row X: Error │
         │         │   message here │
         │         └────────────────┘
         │
         ▼
    ┌──────────────────────┐
    │  Create Transaction  │
    │  (All or Nothing)    │
    │                      │
    │  START TRANSACTION   │
    │  • Create deposit    │
    │  • Post J/E entries  │
    │  • Update accounts   │
    │  • Update ledgers    │
    │  COMMIT              │
    └────────┬─────────────┘
             │
      ┌──────┴──────────────┐
      │                     │
      ▼ Success            ▼ Failure
   ┌────┐             ┌──────────────┐
   │OK  │             │ ROLLBACK     │
   │    │             │ Undo all     │
   │    │             │ changes      │
   └────┘             └──────────────┘
```

## Performance Characteristics

```
Operation              Typical Time    Max Records    Notes
─────────────────────────────────────────────────────────────
Record Single         100-500ms       1              Form submit
  Payment

Bulk Import 10        1-2s            10             1s per record
  Records

Bulk Import 100       10-15s          100            0.1s per record
  Records

Bulk Import 500       30-50s          500            0.1s per record

List 1000             < 2s            1000           With pagination
  Deposits

Filter/Search         < 500ms         1000           Real-time

Member Dropdown       < 1s            10000          May need paging

Export CSV            2-5s            1000           Depends on rows

Export PDF            5-10s           500            Memory intensive
```

## Deployment Architecture

```
┌──────────────────────────────────────┐
│        Client Browser                │
│  (React SPA with Deposits UI)        │
└──────────────┬───────────────────────┘
               │
        HTTP/HTTPS
               │
┌──────────────▼───────────────────────┐
│    Production Server (Node.js)       │
│  ├─ NestJS Framework                │
│  ├─ Express.js HTTP Server          │
│  ├─ Deposits API Endpoints          │
│  └─ Prisma Client (ORM)             │
└──────────────┬───────────────────────┘
               │
         TCP/Connection
               │
┌──────────────▼───────────────────────┐
│    PostgreSQL Database               │
│  (Neon - Serverless PostgreSQL)      │
│  ├─ deposits table                  │
│  ├─ accounts table                  │
│  ├─ journal_entries table           │
│  ├─ category_ledgers table          │
│  ├─ members table                   │
│  └─ ledger table                    │
└──────────────────────────────────────┘
```
