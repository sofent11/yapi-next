import { Module } from '@nestjs/common';
import { ColCompatController } from '../col-compat.controller';
import { InterfaceCompatController } from '../interface-compat.controller';
import { InterfaceTreeController } from '../interface-tree.controller';
import { InternalInterfaceController } from '../internal-interface.controller';
import { MockController } from '../mock.controller';
import { DatabaseModule } from './database.module';
import { ServicesModule } from './services.module';

@Module({
  imports: [DatabaseModule, ServicesModule],
  controllers: [
    InterfaceTreeController,
    InterfaceCompatController,
    ColCompatController,
    InternalInterfaceController,
    MockController
  ]
})
export class InterfaceHttpModule {}
