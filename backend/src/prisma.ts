import { PrismaClient } from '@prisma/client/runtime/library';
import { PrismaNeon } from '@prisma/adapter-neon';
import { Pool } from 'neon-serverless';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const adapter = new PrismaNeon(pool);

export const prisma = new PrismaClient({
  adapter
});
