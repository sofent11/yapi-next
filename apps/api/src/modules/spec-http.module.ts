import { Module } from '@nestjs/common';
import { OpenCompatController } from '../open-compat.controller';
import { PluginCompatController } from '../plugin-compat.controller';
import { SpecController } from '../spec.controller';
import { TestCompatController } from '../test-compat.controller';
import { DatabaseModule } from './database.module';
import { ServicesModule } from './services.module';

@Module({
  imports: [DatabaseModule, ServicesModule],
  controllers: [SpecController, OpenCompatController, PluginCompatController, TestCompatController]
})
export class SpecHttpModule {}
