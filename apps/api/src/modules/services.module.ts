import { Module } from '@nestjs/common';
import { DatabaseModule } from './database.module';
import { AccessContextService } from '../services/access-context.service';
import { ColCompatService } from '../services/col-compat.service';
import { CounterService } from '../services/counter.service';
import { DocNodeService } from '../services/doc-node.service';
import { FollowCompatService } from '../services/follow-compat.service';
import { GroupCompatService } from '../services/group-compat.service';
import { InterfaceBulkUpsertService } from '../services/interface-bulk-upsert.service';
import { InterfaceCatService } from '../services/interface-cat.service';
import { InterfaceCompatService } from '../services/interface-compat.service';
import { InterfaceConflictService } from '../services/interface-conflict.service';
import { InterfaceTreeCacheService } from '../services/interface-tree-cache.service';
import { InterfaceTreeService } from '../services/interface-tree.service';
import { LegacyCryptoService } from '../services/legacy-crypto.service';
import { LogCompatService } from '../services/log-compat.service';
import { MockService } from '../services/mock.service';
import { OpenapiParserService } from '../services/openapi-parser.service';
import { PerfMetricsService } from '../services/perf-metrics.service';
import { ProjectApiMarkdownService } from '../services/project-api-markdown.service';
import { ProjectAuthService } from '../services/project-auth.service';
import { ProjectCompatService } from '../services/project-compat.service';
import { SessionAuthService } from '../services/session-auth.service';
import { SpecExportService } from '../services/spec-export.service';
import { SpecImportTaskService } from '../services/spec-import-task.service';
import { SpecService } from '../services/spec.service';

const serviceProviders = [
  AccessContextService,
  CounterService,
  DocNodeService,
  InterfaceBulkUpsertService,
  InterfaceCatService,
  InterfaceCompatService,
  InterfaceTreeService,
  InterfaceTreeCacheService,
  InterfaceConflictService,
  OpenapiParserService,
  PerfMetricsService,
  ProjectAuthService,
  ProjectApiMarkdownService,
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
];

@Module({
  imports: [DatabaseModule],
  providers: serviceProviders,
  exports: serviceProviders
})
export class ServicesModule {}
