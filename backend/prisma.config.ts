// prisma.config.ts
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

console.log('Loaded DATABASE_URL:', process.env.DATABASE_URL); // debug

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),          // pooled for PrismaClient queries (your app)
    shadowDatabaseUrl: env('DIRECT_URL')  // direct for migrate dev / shadow ops
  },
});