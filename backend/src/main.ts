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

  // CORS configuration - allow any subdomain of soyosoyosacco.com
  app.enableCors({
    origin: (origin, callback) => {
      // Allow no origin (curl, Postman, server-to-server, mobile)
      if (!origin) return callback(null, true);
      
      // Allow any soyosoyosacco.com subdomain
      if (origin.includes('soyosoyosacco.com') || process.env.NODE_ENV === 'development') {
        callback(null, true);
      } else {
        console.warn(`CORS blocked for origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Authorization, Accept',
    credentials: false,           // set to true only if using cookies/auth
    preflightContinue: false,
    optionsSuccessStatus: 200,
    maxAge: 3600,
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`Backend running on port ${port}`);
}

bootstrap();
