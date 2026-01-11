import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS so frontend can call backend
  app.enableCors({
    origin: [
      'https://soyosoyo-reactapp.onrender.com',
      'https://app.soyosoyosacco.com'
    ],
    credentials: true,
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`Backend running on port ${port}`);
}
bootstrap();
