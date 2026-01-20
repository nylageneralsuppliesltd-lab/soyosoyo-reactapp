Backend service

## Environment

- `DIRECT_URL`: Primary Postgres connection string (non-pooled) used by Prisma migrations and the app datasource.
- `AUDIT_DATABASE_URL`: Separate Postgres connection string for audit logging (audit Prisma client).

Add these to `.env` and keep them secret (do not commit). Example:

```
DIRECT_URL="postgresql://user:password@host:port/db?sslmode=require"
AUDIT_DATABASE_URL="postgresql://user:password@host:port/auditdb?sslmode=require"
```

## Useful scripts

- `npm run prisma:migrate:dev` — apply and create migrations against `DIRECT_URL`.
- `npm run prisma:generate:audit` — generate the audit Prisma client using `AUDIT_DATABASE_URL`.
- `npm run start:dev` — start NestJS in watch mode (expects both env vars set).
