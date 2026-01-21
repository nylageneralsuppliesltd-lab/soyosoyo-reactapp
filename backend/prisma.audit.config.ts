import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const auditUrl = process.env.AUDIT_DATABASE_URL || process.env.DATABASE_URL;

if (!auditUrl) {
  throw new Error('AUDIT_DATABASE_URL (or fallback DATABASE_URL) must be set for audit database');
}

export default defineConfig({
  schema: 'prisma/audit.schema.prisma',
  datasource: {
    url: auditUrl,
  },
  migrations: {
    path: 'prisma/migrations-audit',
  },
});
