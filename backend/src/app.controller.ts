import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getRoot() {
    return {
      message: 'API is running',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
