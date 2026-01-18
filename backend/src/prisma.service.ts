// src/prisma/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

// Global setup for Neon serverless driver (do this once, e.g. here or in main.ts)
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
neonConfig.webSocketConstructor = ws;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      adapter: new PrismaNeon({
        connectionString: process.env.DATABASE_URL!,
      }),
      // Optional: more granular logging (useful in dev)
      log: process.env.NODE_ENV === 'development'
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'event', level: 'info' },
            { emit: 'event', level: 'warn' },
            { emit: 'event', level: 'error' },
          ]
        : ['error'],
    });

    // Optional: listen to query events for detailed logging
    if (process.env.NODE_ENV === 'development') {
      this.$on('query', (e) => {
        this.logger.debug(`Query: ${e.query} - Duration: ${e.duration}ms - Params: ${e.params}`);
      });
    }
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Prisma connected successfully to Neon');
    } catch (error) {
      this.logger.error('Failed to connect to Neon database during init', error);
      throw error; // Crash early in dev; in prod consider retry logic
    }
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
      this.logger.log('Prisma disconnected cleanly');
    } catch (error) {
      this.logger.warn('Error during Prisma disconnect', error);
    }
  }
}