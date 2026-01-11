import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

// Create the Neon adapter
const adapter = new PrismaNeon({
  connectionString: process.env.DATABASE_URL, // your Neon DB URL
});

// Create Prisma client with the adapter
export const prisma = new PrismaClient({ adapter });

// Optional: connect immediately (useful in NestJS bootstrap)
prisma.$connect().catch((err) => {
  console.error('Failed to connect to the database:', err);
});
