import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';
dotenv.config();

async function bootstrap() {
  // Debug: print DATABASE_URL
  console.log('DATABASE_URL:', process.env.DATABASE_URL);

  const app = await NestFactory.create(AppModule);

  // CORS so frontend can call backend
  app.enableCors({
    origin: [
      'https://soyosoyo-reactapp.onrender.com',
      'https://app.soyosoyosacco.com',
      'http://localhost:5173',
      'http://localhost:3000',
    ],
    credentials: true,
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`Backend running on port ${port}`);
}
bootstrap();
