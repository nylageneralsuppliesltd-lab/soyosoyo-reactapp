// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
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

  // Align backend routes with frontend expectations
  app.setGlobalPrefix('api');

  // Respond to root health probes that use GET/HEAD on '/'
  const httpAdapter = app.getHttpAdapter();
  const instance: any = httpAdapter.getInstance();
  instance.get('/', (_req: any, res: any) => res.status(200).send({ status: 'ok' }));
  instance.head('/', (_req: any, res: any) => res.status(200).end());

  // Enhanced error diagnostics for Prisma
  app.useGlobalFilters(new PrismaExceptionFilter());

  // CORS - allow specific domains and support credentials
  const allowedOrigins = [
    'https://api.soyosoyosacco.com',
    'https://react.soyosoyosacco.com',
    'https://soyosoyo-reactapp-0twy.onrender.com',
    'http://localhost:3000',
    'http://localhost:5173',
  ];

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      console.warn(`CORS blocked for origin: ${origin}`);
      return callback(new Error('Not allowed by CORS'));
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Authorization, Accept',
    credentials: true, // needed because frontend sets withCredentials=true
    preflightContinue: false,
    optionsSuccessStatus: 200,
  });

  const port = process.env.PORT || 3000;
  // Bind to 0.0.0.0 to ensure local and external access
  const httpServer = await app.listen(port as number, '0.0.0.0');
  
  // Add explicit error handler to the HTTP server
  httpServer.on('error', (err) => {
    console.error('HTTP Server error:', err);
    process.exit(1);
  });
  
  console.log(`Backend running on port ${port}`);
  console.log('Server is ready to accept requests');
  
  // Keep the process alive
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, gracefully shutting down...');
    await app.close();
    process.exit(0);
  });
  
  process.on('SIGINT', async () => {
    console.log('SIGINT received, gracefully shutting down...');
    await app.close();
    process.exit(0);
  });
}

// Catch unhandled rejections that occur after bootstrap
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

bootstrap().catch((err) => {
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});
