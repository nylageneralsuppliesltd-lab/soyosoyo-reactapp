import { defineConfig } from '@prisma/internals';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    provider: 'postgresql',
    url: process.env.DATABASE_URL,
  },
});
