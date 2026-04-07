import { Module } from '@nestjs/common';
import { HealthController } from '../health.controller';
import { ServicesModule } from './services.module';

@Module({
  imports: [ServicesModule],
  controllers: [HealthController]
})
export class PlatformHttpModule {}
