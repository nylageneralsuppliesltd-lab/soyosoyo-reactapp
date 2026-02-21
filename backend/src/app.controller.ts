import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/public.decorator';

@Controller()
export class AppController {
  @Get()
  @Public()
  getRoot() {
    return {
      message: 'API is running',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
