# Reports Module Implementation Guide

## Overview

The **Reports Module** is a comprehensive financial reporting system with real-time data aggregation, multiple export formats, period-based filtering, and a mobile-friendly UI.

### Features

✅ **14 Report Types:**
- Contribution Summary (filtered by period/member)
- Fines Summary (issued, paid, outstanding)
- Loans (Member) Portfolio
- Bank Loans (External/Inward)
- Debtor Loans (Non-member Outward)
- Expense Summary
- Account Balances
- Full Transaction Statement
- Cash Flow Statement
- Trial Balance
- Income Statement
- Balance Sheet
- SASRA Compliance Snapshot
- Dividends Report

✅ **Multiple Export Formats:**
- JSON (raw data)
- CSV (spreadsheet)
- XLSX (Excel workbook)
- PDF (printable documents)

✅ **Smart Period Filters:**
- Current Month
- Current Quarter
- Current Half-Year
- Current Year
- Custom Date Range

✅ **Mobile-First Design:**
- Responsive grid layouts
- Collapsible filters on mobile
- Touch-friendly buttons
- Optimized for all screen sizes

---

## Backend Implementation

### Files Created/Modified

**`backend/src/reports/`**
```
reports/
├── reports.service.ts      # Main report logic & aggregations
├── reports.controller.ts   # API endpoints
└── reports.module.ts       # NestJS module definition
```

**Key Endpoints:**

```
GET /api/reports/catalog              # List all available reports
GET /api/reports/:reportKey           # Download/view specific report
```

### Query Parameters

All report endpoints accept:
- `format`: `json` | `csv` | `xlsx` | `pdf` (default: `json`)
- `period`: `month` | `quarter` | `half` | `year` | `custom`
- `startDate`: ISO date string (for custom period)
- `endDate`: ISO date string (for custom period)
- Report-specific filters (e.g., `memberId`, `category`, `status`)

### Example API Calls

**Fetch contribution report as Excel:**
```bash
GET /api/reports/contributions?format=xlsx&period=month
```

**Fetch fines for a specific member:**
```bash
GET /api/reports/fines?memberId=5&period=quarter&format=pdf
```

**Fetch custom date range in JSON:**
```bash
GET /api/reports/transactions?format=json&period=custom&startDate=2026-01-01&endDate=2026-01-31
```

### Report Data Aggregation

Each report queries the Prisma ORM and aggregates real data:

- **Contributions**: Deposits filtered by type & period
- **Fines**: Fine records with issued/paid/outstanding totals
- **Loans**: Outward vs. inward loans with status grouping
- **Expenses**: Withdrawals categorized by type
- **Trial Balance**: Journal entry aggregation by account
- **Income Statement**: Revenue minus expenses with surplus calculation
- **Balance Sheet**: Assets, liabilities, equity composition
- **SASRA**: Liquidity ratios, portfolio metrics, compliance checks

### Export Formatting

- **CSV**: Safe quoting of special characters
- **XLSX**: ExcelJS workbook with headers + data rows
- **PDF**: PDFKit formatting with title + tabular output
- **JSON**: Pretty-printed with metadata

---

## Frontend Implementation

### Files Created/Modified

**`frontend/src/pages/`**
```
APIReportsPage.jsx    # Main reports UI component
```

**`frontend/src/styles/`**
```
reports.css           # Mobile-first responsive styling
```

**`frontend/src/App.jsx`**
- Added route: `/api-reports` → `APIReportsPage`

**`frontend/src/components/Sidebar.jsx`**
- Updated Reports submenu with "Download Reports (API)" link

### Component Structure

#### APIReportsPage Component

**State Management:**
```javascript
const [reports, setReports] = useState([]);              // Catalog
const [loading, setLoading] = useState(true);            // Loading state
const [downloading, setDownloading] = useState(false);   // Download state
const [downloadStatus, setDownloadStatus] = useState({}); // Per-report status
const [filters, setFilters] = useState({                 // Active filters
  period: 'month',
  format: 'json',
  startDate: '',
  endDate: '',
});
const [showFilters, setShowFilters] = useState(false);   // Mobile filter toggle
const [expandedReport, setExpandedReport] = useState(null); // Mobile accordion
```

**Key Functions:**
- `handleDownload(reportKey)` - Fetch and download report
- `downloadBlob(blob, filename)` - Trigger browser download
- `getPeriodLabel()` - Format period display

### UI Layout

**Desktop (≥640px):**
- 2-column filter layout
- 3-column report grid
- Always-visible filters

**Mobile (<640px):**
- Collapsible filter toggle
- Single-column report cards with expandable details
- Touch-optimized buttons

### Mobile-First CSS Features

```css
/* Tailwind-inspired utility classes + custom CSS */
@media (min-width: 640px) { /* Tablets */ }
@media (min-width: 768px) { /* Small desktops */ }
@media (min-width: 1024px) { /* Large desktops */ }

/* Accessibility */
@media (prefers-reduced-motion: reduce) { /* Respect motion preferences */ }
@media (prefers-color-scheme: dark) { /* Dark mode support */ }
```

---

## Usage Guide

### For End Users

1. **Navigate to Reports:**
   - Click "Reports" in sidebar → "Download Reports (API)"

2. **Select Period:**
   - Month, Quarter, Half-Year, Year, or Custom date range
   - Summary displays selected period

3. **Choose Format:**
   - JSON (view raw data)
   - CSV (open in spreadsheet app)
   - XLSX (Excel workbook)
   - PDF (print-friendly)

4. **Expand Report & Download:**
   - Click report card to reveal download button
   - Click "Download Report"
   - File automatically saves to browser Downloads folder

5. **Track Status:**
   - "Downloading..." spinner during fetch
   - "Downloaded!" confirmation (3 sec, then clears)
   - "Failed" error state if download fails

### For Developers

**Add a New Report:**

1. **Create aggregation method** in `reports.service.ts`:
```typescript
private async myNewReport(dateRange: { start: Date; end: Date }) {
  const rows = await this.prisma.someModel.findMany({
    where: { date: { gte: dateRange.start, lte: dateRange.end } }
  });
  const meta = { /* summary totals */ };
  return { rows, meta };
}
```

2. **Add case** in `handleReport()` method:
```typescript
case 'myNewReport':
  result = await this.myNewReport(dateRange);
  break;
```

3. **Add catalog entry** in `getCatalog()`:
```typescript
{ key: 'myNewReport', name: 'My New Report', filters: ['period'] },
```

4. **Add controller endpoint** in `reports.controller.ts`:
```typescript
@Get('my-new-report')
async myNewReport(@Query() query: any, @Res({ passthrough: true }) res: Response) {
  return this.reportsService.handleReport('myNewReport', query, res);
}
```

---

## Data Flow Diagram

```
Frontend (APIReportsPage)
    ↓
    ├─→ Fetch Catalog (GET /api/reports/catalog)
    │   └─→ Backend ReportsService.getCatalog()
    │       └─→ Return: [{ key, name, filters }, ...]
    │
    └─→ Handle Download (GET /api/reports/{key}?params)
        └─→ Backend ReportsService.handleReport()
            ├─→ Parse filters & build date range
            ├─→ Query Prisma ORM for aggregated data
            ├─→ Format output (JSON/CSV/XLSX/PDF)
            └─→ Stream to browser or return JSON
                └─→ Frontend downloads blob or displays data
```

---

## Performance Considerations

### Optimizations

✅ **Period-based filtering** - Only aggregate data within date range  
✅ **Lazy report loading** - Fetch on-demand, not on page load  
✅ **Streaming responses** - Files download immediately (no temp storage)  
✅ **Database indexes** - Queries use `@@index` on `date`, `type`, etc.  

### Known Limitations

⚠️ **SASRA Portfolio at Risk** - Currently a placeholder; requires arrears tracking (30+ day aging)  
⚠️ **Large datasets** - Consider pagination for 10k+ transaction reports  
⚠️ **Real-time updates** - Reports reflect data up to request time (slight lag possible)

---

## Testing

### Manual Testing Checklist

- [ ] Visit `/api-reports` and see report catalog load
- [ ] Filter by period preset (month/quarter/etc.)
- [ ] Filter by custom date range
- [ ] Select different formats (JSON/CSV/XLSX/PDF)
- [ ] Download a report; verify file name and format
- [ ] Test on mobile device (< 640px); verify filter collapse
- [ ] Test dark mode (if browser supports)
- [ ] Test with slow network; verify loading spinner
- [ ] Test download failure; verify error message

### Example Test Data

Create test transactions to verify reports:

```bash
# Backend Prisma Studio
npm run prisma:studio

# Add sample deposits, loans, fines
# Then download reports to verify aggregations
```

---

## Troubleshooting

### Reports Not Loading

**Issue:** "No reports available"  
**Solution:**
- Check backend is running (`npm run start:dev`)
- Verify `/api/reports/catalog` returns data
- Check browser console for fetch errors

### Download Fails

**Issue:** "Failed" status after clicking download  
**Solution:**
- Check backend logs for query errors
- Verify date format (ISO: YYYY-MM-DD)
- Check database connection
- Clear browser cache & retry

### Missing Data in Report

**Issue:** Report shows no data or incomplete aggregation  
**Solution:**
- Verify data exists in database (Prisma Studio)
- Check date filters (period may exclude transactions)
- Review report logic in `reports.service.ts`
- Run against full year to ensure coverage

### Styling Issues on Mobile

**Issue:** Buttons/filters overlap or misalign  
**Solution:**
- Force refresh (Cmd/Ctrl + Shift + R)
- Check viewport meta tag in `index.html`
- Verify CSS file is loaded (DevTools → Network)
- Test in different browser

---

## Future Enhancements

🚀 **Planned Features:**
- Real-time report preview before download
- Scheduled report generation (email delivery)
- Custom report builder (drag-and-drop fields)
- Advanced filtering (multi-select statuses, member groups)
- Report templates (standardized format for board meetings)
- Arrears aging (auto-update SASRA PAR metric)
- Caching for frequently accessed reports
- Audit trail (track who downloaded what & when)

---

## Architecture Notes

### Why Passthrough Responses?

The controller uses `@Res({ passthrough: true })` to allow:
1. **JSON responses** to be serialized by NestJS
2. **Streamed files** (CSV/PDF) to be sent via res.end()/res.pipe()

Without `passthrough: true`, NestJS intercepts the response and JSON serialization fails for binary formats.

### Why Per-Report Routes?

Instead of `/reports/{key}` we use `/reports/{key}` endpoints (e.g., `/reports/contributions`). This:
- Improves API discoverability
- Allows per-route decorators/guards (auth, rate limiting)
- Aligns with RESTful conventions

---

## Support

For issues or questions:
1. Check this guide's Troubleshooting section
2. Review backend logs: `npm run start:dev 2>&1 | tail -50`
3. Check browser DevTools → Network tab for failed requests
4. Review [Prisma ORM docs](https://www.prisma.io/docs/) for query issues

---

**Last Updated:** January 22, 2026  
**Backend:** NestJS 10.3 + Prisma 7.2  
**Frontend:** React 18 + Vite + Tailwind CSS  
**Formats:** JSON, CSV, XLSX, PDF
