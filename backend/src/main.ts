// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';
dotenv.config();

async function bootstrap() {
  // Debug: print DATABASE_URL (mask password in logs!)
  const dbUrl = process.env.DATABASE_URL || 'not set';
  console.log(
    'DATABASE_URL:',
    dbUrl.includes('@')
      ? dbUrl.replace(/:\/\/[^@]+@/, '://***:***@')
      : dbUrl,
  );

  const app = await NestFactory.create(AppModule);

  // Dynamic allowed origins for your frontends
  const allowedBaseDomains = ['soyosoyosacco.com']; // allow any subdomain
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, Postman, mobile apps)
      if (!origin) return callback(null, true);

      const isAllowed = allowedBaseDomains.some(domain => origin.endsWith(domain));
      if (isAllowed || process.env.NODE_ENV === 'development') {
        callback(null, true);
      } else {
        console.warn(`CORS blocked for origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Authorization, Accept',
    credentials: true,            // allow cookies/auth if needed
    preflightContinue: false,     // ensures Nest handles OPTIONS
    optionsSuccessStatus: 204,    // some browsers require this
    maxAge: 86400,                // cache preflight 24h
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`Backend running on port ${port}`);
}

bootstrap();
