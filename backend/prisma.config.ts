// prisma.config.ts
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',  // adjust path if your schema is elsewhere

  datasource: {
    // CLI / migrate dev / studio use this URL → MUST be DIRECT (non-pooled)
    url: env('DIRECT_URL'),
    // If Neon ever requires a separate shadow DB (rare), add:
    // shadowDatabaseUrl: env('SHADOW_DATABASE_URL'),
  },

  // Optional: custom seed command (if you have prisma/seed.ts)
  // migrations: {
  //   seed: 'tsx prisma/seed.ts',
  // },
});