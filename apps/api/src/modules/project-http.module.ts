import { Module } from '@nestjs/common';
import { DocNodeController } from '../doc-node.controller';
import { GroupCompatController } from '../group-compat.controller';
import { LogCompatController } from '../log-compat.controller';
import { ProjectCompatController } from '../project-compat.controller';
import { DatabaseModule } from './database.module';
import { ServicesModule } from './services.module';

@Module({
  imports: [DatabaseModule, ServicesModule],
  controllers: [ProjectCompatController, GroupCompatController, LogCompatController, DocNodeController]
})
export class ProjectHttpModule {}
