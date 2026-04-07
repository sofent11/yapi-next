import { Module } from '@nestjs/common';
import { FollowCompatController } from '../follow-compat.controller';
import { UserCompatController } from '../user-compat.controller';
import { DatabaseModule } from './database.module';
import { ServicesModule } from './services.module';

@Module({
  imports: [DatabaseModule, ServicesModule],
  controllers: [UserCompatController, FollowCompatController]
})
export class UserHttpModule {}
