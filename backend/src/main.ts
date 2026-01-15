import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';
dotenv.config();

async function bootstrap() {
  // Debug: print DATABASE_URL
  console.log('DATABASE_URL:', process.env.DATABASE_URL);

  const app = await NestFactory.create(AppModule);

  // Robust CORS for local dev and production
  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://localhost:5173',
      'https://api.soyosoyosacco.com',
      'https://app.soyosoyosacco.com',
      'https://soyosoyo-reactapp.onrender.com',
      'http://localhost',
      '*', // fallback for dev, remove for production security
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Authorization, Accept',
    credentials: true,
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`Backend running on port ${port}`);
}
bootstrap();
