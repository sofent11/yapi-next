import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HealthController } from './health.controller';
import { SpecController } from './spec.controller';
import { InterfaceTreeController } from './interface-tree.controller';
import { OpenCompatController } from './open-compat.controller';
import { PluginCompatController } from './plugin-compat.controller';
import { InternalInterfaceController } from './internal-interface.controller';
import { UserCompatController } from './user-compat.controller';
import { ProjectCompatController } from './project-compat.controller';
import { GroupCompatController } from './group-compat.controller';
import { InterfaceCompatController } from './interface-compat.controller';
import { FollowCompatController } from './follow-compat.controller';
import { ColCompatController } from './col-compat.controller';
import { LogCompatController } from './log-compat.controller';
import { TestCompatController } from './test-compat.controller';
import { MockController } from './mock.controller';
import { CounterEntity, CounterSchema } from './database/schemas/counter.schema';
import { AvatarEntity, AvatarSchema } from './database/schemas/avatar.schema';
import { GroupEntity, GroupSchema } from './database/schemas/group.schema';
import { FollowEntity, FollowSchema } from './database/schemas/follow.schema';
import { ProjectEntity, ProjectSchema } from './database/schemas/project.schema';
import { TokenEntity, TokenSchema } from './database/schemas/token.schema';
import { UserEntity, UserSchema } from './database/schemas/user.schema';
import { InterfaceCatEntity, InterfaceCatSchema } from './database/schemas/interface-cat.schema';
import { InterfaceEntity, InterfaceSchema } from './database/schemas/interface.schema';
import { InterfaceCaseEntity, InterfaceCaseSchema } from './database/schemas/interface-case.schema';
import { InterfaceColEntity, InterfaceColSchema } from './database/schemas/interface-col.schema';
import { LogEntity, LogSchema } from './database/schemas/log.schema';
import { CounterService } from './services/counter.service';
import { InterfaceBulkUpsertService } from './services/interface-bulk-upsert.service';
import { InterfaceCatService } from './services/interface-cat.service';
import { InterfaceCompatService } from './services/interface-compat.service';
import { InterfaceTreeService } from './services/interface-tree.service';
import { InterfaceTreeCacheService } from './services/interface-tree-cache.service';
import { InterfaceConflictService } from './services/interface-conflict.service';
import { OpenapiParserService } from './services/openapi-parser.service';
import { PerfMetricsService } from './services/perf-metrics.service';
import { ProjectAuthService } from './services/project-auth.service';
import { SpecImportTaskEntity, SpecImportTaskSchema } from './database/schemas/spec-import-task.schema';
import { SpecImportTaskService } from './services/spec-import-task.service';
import { SpecExportService } from './services/spec-export.service';
import { SpecService } from './services/spec.service';
import { LegacyCryptoService } from './services/legacy-crypto.service';
import { SessionAuthService } from './services/session-auth.service';
import { ProjectCompatService } from './services/project-compat.service';
import { GroupCompatService } from './services/group-compat.service';
import { FollowCompatService } from './services/follow-compat.service';
import { ColCompatService } from './services/col-compat.service';
import { LogCompatService } from './services/log-compat.service';
import { MockService } from './services/mock.service';

@Module({
  imports: [
    MongooseModule.forRoot(process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/yapi', {
      autoIndex: process.env.MONGO_AUTO_INDEX !== 'false'
    }),
    MongooseModule.forFeature([
      { name: CounterEntity.name, schema: CounterSchema },
      { name: AvatarEntity.name, schema: AvatarSchema },
      { name: GroupEntity.name, schema: GroupSchema },
      { name: FollowEntity.name, schema: FollowSchema },
      { name: ProjectEntity.name, schema: ProjectSchema },
      { name: TokenEntity.name, schema: TokenSchema },
      { name: UserEntity.name, schema: UserSchema },
      { name: InterfaceCatEntity.name, schema: InterfaceCatSchema },
      { name: InterfaceEntity.name, schema: InterfaceSchema },
      { name: InterfaceCaseEntity.name, schema: InterfaceCaseSchema },
      { name: InterfaceColEntity.name, schema: InterfaceColSchema },
      { name: LogEntity.name, schema: LogSchema },
      { name: SpecImportTaskEntity.name, schema: SpecImportTaskSchema }
    ])
  ],
  controllers: [
    HealthController,
    SpecController,
    InterfaceTreeController,
    OpenCompatController,
    PluginCompatController,
    InternalInterfaceController,
    UserCompatController,
    ProjectCompatController,
    GroupCompatController,
    InterfaceCompatController,
    FollowCompatController,
    ColCompatController,
    LogCompatController,
    TestCompatController,
    MockController
  ],
  providers: [
    CounterService,
    InterfaceBulkUpsertService,
    InterfaceCatService,
    InterfaceCompatService,
    InterfaceTreeService,
    InterfaceTreeCacheService,
    InterfaceConflictService,
    OpenapiParserService,
    PerfMetricsService,
    ProjectAuthService,
    SpecImportTaskService,
    SpecExportService,
    SpecService,
    LegacyCryptoService,
    SessionAuthService,
    ProjectCompatService,
    GroupCompatService,
    FollowCompatService,
    ColCompatService,
    LogCompatService,
    MockService
  ]
})
export class AppModule {}
