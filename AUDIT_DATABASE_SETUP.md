# Audit Database Setup Guide

## Overview
The application uses a **separate Prisma client** for audit logs, allowing you to maintain audit data in a completely separate database from your main application data.

## Configuration Options

### Option 1: Same Database (Current Setup)
If you don't set `AUDIT_DATABASE_URL`, the system automatically falls back to using `DATABASE_URL`. This means audit logs go to the same database as your main data.

**Render Environment Variables:**
```
DATABASE_URL=postgresql://user:password@host/dbname
```

### Option 2: Separate Audit Database (Recommended for Production)
For better security, compliance, and performance isolation, use a separate database for audit logs.

**Render Environment Variables:**
```
DATABASE_URL=postgresql://user:password@host/main_db
AUDIT_DATABASE_URL=postgresql://user:password@host/audit_db
```

## Setting Up Separate Audit Database on Neon

### Step 1: Create Second Database
1. Go to your Neon console: https://console.neon.tech
2. Create a new database (or use a separate project)
3. Copy the connection string

### Step 2: Add to Render Environment
1. Go to your Render dashboard
2. Select your backend service
3. Go to **Environment** tab
4. Add new environment variable:
   - Key: `AUDIT_DATABASE_URL`
   - Value: Your Neon audit database connection string

### Step 3: Initialize Audit Database Schema
The audit database needs its own schema. Run this command locally first:

```bash
# Set your audit database URL temporarily
$env:AUDIT_DATABASE_URL="your-audit-db-connection-string"

# Generate and apply the audit schema
cd backend
npx prisma migrate deploy --config prisma.audit.config.ts
```

### Step 4: Deploy to Render
Push your changes and Render will automatically:
1. Generate both Prisma clients (main + audit)
2. Apply migrations to the main database
3. Connect the audit client to `AUDIT_DATABASE_URL`

## How It Works

### Architecture
```
┌─────────────────────────────────────────┐
│         NestJS Application              │
├─────────────────┬───────────────────────┤
│  Main Prisma    │   Audit Prisma        │
│  Client         │   Client              │
│  (members,      │   (audit logs only)   │
│   deposits,     │                       │
│   withdrawals)  │                       │
└────────┬────────┴──────────┬────────────┘
         │                   │
         ▼                   ▼
  ┌──────────────┐   ┌──────────────┐
  │ Main Database│   │Audit Database│
  │ (DATA_URL)   │   │(AUDIT_DB_URL)│
  └──────────────┘   └──────────────┘
```

### File Structure
- **prisma/schema.prisma** - Main database schema
- **prisma/audit.schema.prisma** - Audit database schema
- **prisma.config.ts** - Main Prisma configuration
- **prisma.audit.config.ts** - Audit Prisma configuration
- **src/prisma.service.ts** - Main database service
- **src/audit/audit-prisma.service.ts** - Audit database service

### Code Implementation
The `AuditPrismaService` automatically handles the fallback:

```typescript
constructor() {
  const url = process.env.AUDIT_DATABASE_URL || process.env.DATABASE_URL;
  process.env.AUDIT_DATABASE_URL = url;
  super();
}
```

## Benefits of Separate Audit Database

### 1. Security & Compliance
- Audit logs can't be tampered with by compromising main database
- Different access controls for audit data
- Easier compliance with regulations (SOX, HIPAA, GDPR)

### 2. Performance
- Heavy audit writes don't impact main application queries
- Can optimize audit database for write-heavy workload
- Independent scaling and backup schedules

### 3. Retention & Archival
- Keep audit logs longer than operational data
- Different backup retention policies
- Easier to archive old audit data separately

### 4. Monitoring & Analysis
- Dedicated connection pool for audit operations
- Can run heavy analytics on audit data without affecting app
- Separate monitoring and alerting

## Migration Path

### Current State → Separate Database
If you're currently using the same database and want to migrate:

1. **Create new audit database** on Neon
2. **Export existing audit logs** from main database:
   ```sql
   COPY (SELECT * FROM "AuditLog") TO '/tmp/audit_logs.csv' CSV HEADER;
   ```
3. **Import to new audit database**
4. **Update `AUDIT_DATABASE_URL`** in Render
5. **Redeploy application**
6. **Delete old audit logs** from main database (optional)

## Troubleshooting

### Error: "AUDIT_DATABASE_URL must be set"
- **Cause:** Neither `AUDIT_DATABASE_URL` nor `DATABASE_URL` is set
- **Fix:** Ensure at least `DATABASE_URL` is set in your environment

### Error: "Can't reach database server"
- **Cause:** Audit database URL is incorrect or database is down
- **Fix:** Verify the connection string and database availability

### Build fails with "Unknown property datasources"
- **Cause:** Trying to pass datasources to Prisma 7 client constructor
- **Fix:** Use environment variables instead (already fixed in latest code)

## Maintenance

### Backup Strategy
```bash
# Main database
pg_dump $DATABASE_URL > main_backup.sql

# Audit database
pg_dump $AUDIT_DATABASE_URL > audit_backup.sql
```

### Monitoring Queries
```sql
-- Check audit log volume
SELECT COUNT(*), DATE(created_at) FROM "AuditLog" 
GROUP BY DATE(created_at) 
ORDER BY DATE(created_at) DESC;

-- Recent audit activity
SELECT * FROM "AuditLog" 
ORDER BY created_at DESC 
LIMIT 100;
```

## Best Practices

1. **Always set `AUDIT_DATABASE_URL` in production**
2. **Use different credentials** for main vs audit database
3. **Enable connection pooling** separately for each database
4. **Monitor audit database size** - it grows quickly
5. **Implement log rotation** or archival for old audit data
6. **Test failover scenarios** for audit database separately

## Cost Considerations

Neon Pricing:
- Free tier: 0.5 GB storage, 1 GB transfer
- Pro tier: $0.102/GB-month storage, compute billed separately

Estimate: If you log 1000 actions/day at ~1KB each, that's ~30MB/month. A separate database adds minimal cost but significant benefits.
