import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';
dotenv.config();

async function bootstrap() {
  // Debug: print DATABASE_URL (mask password in real logs!)
  const dbUrl = process.env.DATABASE_URL || 'not set';
  console.log(
    'DATABASE_URL:',
    dbUrl.includes('@')
      ? dbUrl.replace(/:\/\/[^@]+@/, '://***:***@')  // mask user:pass
      : dbUrl,
  );

  const app = await NestFactory.create(AppModule);

  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://api.soyosoyosacco.com',
    'https://app.soyosoyosacco.com',
    'https://soyosoyo-reactapp.onrender.com',
    'https://react.soyosoyosacco.com',
    // Add staging or other envs here
  ];

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, Postman, server-to-server)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
        callback(null, true);
      } else {
        console.warn(`CORS blocked for origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Authorization, Accept',
    credentials: true,          // keep only if you really need cookies/auth
    maxAge: 86400,              // cache preflight 24h
    preflightContinue: false,
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`Backend running on port ${port}`);
}

bootstrap();