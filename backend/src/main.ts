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

  // CORS - allow all soyosoyosacco.com subdomains + fallback wildcard
  app.enableCors({
    origin: true,  // Allow all origins (simplest workaround for testing)
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Authorization, Accept',
    credentials: false,
    preflightContinue: false,
    optionsSuccessStatus: 200,
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`Backend running on port ${port}`);
}

bootstrap();
