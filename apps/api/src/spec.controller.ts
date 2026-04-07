import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import type {
  InterfacePublishStatus,
  SpecExportFormat,
  SpecExportQuery,
  SpecFormat,
  SpecImportRequest,
  SpecSource,
  SyncMode
} from '@yapi-next/shared-types';
import { resReturn } from './common/api-response';
import { mapError } from './common/error-response';
import { InputMap, pickJson, pickNumber, pickString, pickBoolean } from './common/request-utils';
import { PerfMetricsService } from './services/perf-metrics.service';
import { AccessContextService } from './services/access-context.service';
import { ProjectAuthService } from './services/project-auth.service';
import { SpecImportTaskService } from './services/spec-import-task.service';
import { SpecService } from './services/spec.service';

@Controller('spec')
export class SpecController {
  constructor(
    private readonly specService: SpecService,
    private readonly accessContextService: AccessContextService,
    private readonly projectAuthService: ProjectAuthService,
    private readonly metricsService: PerfMetricsService,
    private readonly taskService: SpecImportTaskService
  ) {}

  @Post('import')
  async importSpec(@Req() req: FastifyRequest, @Body() body: InputMap) {
    const startAt = Date.now();
    try {
      const token = this.accessContextService.pickToken(body);
      const projectId = await this.resolveProjectId(body, token);
      const access = await this.accessContextService.assertProjectAccess({
        req,
        token,
        projectId,
        action: 'edit'
      });

      const source = this.normalizeSource(pickString(body.source));
      const format = this.normalizeFormat(pickString(body.format));
      const syncMode = this.normalizeSyncMode(pickString(body.syncMode));
      const dryRun = pickBoolean(body.dryRun) || pickBoolean(body.dry_run);
      const asyncMode = pickBoolean(body.async);
      const json = pickJson(body.json);
      const url = pickString(body.url);
      const importRequest: SpecImportRequest = {
        project_id: projectId,
        source,
        format,
        syncMode,
        dryRun,
        async: asyncMode,
        json,
        url,
        token
      };

      if (asyncMode) {
        const task = await this.taskService.createTask({
          projectId,
          uid: access.user?._id || 0,
          source: importRequest.source || 'json',
          format: importRequest.format || 'auto',
          syncMode: importRequest.syncMode || 'merge',
          dryRun: importRequest.dryRun === true,
          url: importRequest.url
        });
        void this.taskService.runTask(task.task_id, updateProgress =>
          this.specService.import({
            projectId,
            source: importRequest.source || 'json',
            format: importRequest.format || 'auto',
            json: importRequest.json,
            url: importRequest.url,
            syncMode: importRequest.syncMode || 'merge',
            dryRun: importRequest.dryRun,
            uid: access.user?._id,
            onProgress: updateProgress
          })
        );
        this.metricsService.incCounter('yapi_api_spec_import_total', { status: 'queued', asyncMode: true }, 1);
        this.metricsService.observeHistogram('yapi_api_spec_import_duration_ms', Date.now() - startAt, {
          status: 'queued',
          asyncMode: true
        });
        return resReturn({
          task_id: task.task_id,
          status: task.status,
          progress: task.progress,
          stage: task.stage,
          message: task.message
        });
      }

      const result = await this.specService.import({
        projectId,
        source: importRequest.source || 'json',
        format: importRequest.format || 'auto',
        json: importRequest.json,
        url: importRequest.url,
        syncMode: importRequest.syncMode || 'merge',
        dryRun: importRequest.dryRun,
        uid: access.user?._id
      });
      this.metricsService.incCounter('yapi_api_spec_import_total', { status: 'ok', dryRun }, 1);
      this.metricsService.observeHistogram('yapi_api_spec_import_duration_ms', Date.now() - startAt, {
        status: 'ok',
        dryRun
      });
      return resReturn(result);
    } catch (err) {
      const mapped = mapError(err);
      this.metricsService.incCounter('yapi_api_spec_import_total', { status: 'error' }, 1);
      this.metricsService.observeHistogram('yapi_api_spec_import_duration_ms', Date.now() - startAt, {
        status: 'error'
      });
      return resReturn(null, mapped.errcode, mapped.errmsg);
    }
  }

  @Get('import/task')
  async importTask(@Req() req: FastifyRequest, @Query() query: InputMap) {
    try {
      const access = await this.accessContextService.assertProjectAccess({
        req,
        token: this.accessContextService.pickToken(query),
        projectId: pickNumber(query.project_id),
        action: 'view'
      });
      const taskId = pickString(query.task_id);
      if (!taskId) {
        return resReturn(null, 400, 'task_id 不能为空');
      }
      const task = await this.taskService.getTask(taskId, access.projectId as number);
      return resReturn(task);
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(null, mapped.errcode, mapped.errmsg);
    }
  }

  @Get('import/tasks')
  async importTasks(@Req() req: FastifyRequest, @Query() query: InputMap) {
    try {
      const access = await this.accessContextService.assertProjectAccess({
        req,
        token: this.accessContextService.pickToken(query),
        projectId: pickNumber(query.project_id),
        action: 'view'
      });
      const limit = pickNumber(query.limit) || 20;
      const tasks = await this.taskService.listTasks(access.projectId as number, limit);
      return resReturn({
        count: tasks.length,
        list: tasks
      });
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(null, mapped.errcode, mapped.errmsg);
    }
  }

  @Get('import/task/download')
  async importTaskDownload(
    @Req() req: FastifyRequest,
    @Query() query: InputMap,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    try {
      const access = await this.accessContextService.assertProjectAccess({
        req,
        token: this.accessContextService.pickToken(query),
        projectId: pickNumber(query.project_id),
        action: 'view'
      });
      const taskId = pickString(query.task_id);
      if (!taskId) {
        return resReturn(null, 400, 'task_id 不能为空');
      }
      const task = await this.taskService.getTask(taskId, access.projectId as number);
      reply.header('Content-Type', 'application/json; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename=spec-import-task-${taskId}.json`);
      return JSON.stringify(task, null, 2);
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(null, mapped.errcode, mapped.errmsg);
    }
  }

  @Get('export')
  async exportSpec(@Req() req: FastifyRequest, @Query() query: InputMap) {
    const startAt = Date.now();
    try {
      const access = await this.accessContextService.assertProjectAccess({
        req,
        token: this.accessContextService.pickToken(query),
        projectId: pickNumber(query.project_id) || pickNumber(query.pid),
        action: 'view'
      });

      const exportRequest: SpecExportQuery = {
        project_id: access.projectId as number,
        format: this.normalizeExportFormat(pickString(query.format)),
        status: this.normalizeStatus(pickString(query.status)),
        withWiki: pickBoolean(query.withWiki) || pickBoolean(query.with_wiki),
        cat_id: pickNumber(query.cat_id),
        interface_id: pickNumber(query.interface_id),
        token: access.token
      };
      const result = await this.specService.export({
        projectId: exportRequest.project_id,
        format: exportRequest.format || 'openapi3',
        status: exportRequest.status || 'all',
        catId: exportRequest.cat_id,
        interfaceId: exportRequest.interface_id
      });
      this.metricsService.incCounter(
        'yapi_api_spec_export_total',
        { status: 'ok', format: exportRequest.format || 'openapi3' },
        1
      );
      this.metricsService.observeHistogram('yapi_api_spec_export_duration_ms', Date.now() - startAt, {
        status: 'ok',
        format: exportRequest.format || 'openapi3'
      });
      return resReturn(this.parseJson(result));
    } catch (err) {
      const mapped = mapError(err);
      this.metricsService.incCounter('yapi_api_spec_export_total', { status: 'error' }, 1);
      this.metricsService.observeHistogram('yapi_api_spec_export_duration_ms', Date.now() - startAt, {
        status: 'error'
      });
      return resReturn(null, mapped.errcode, mapped.errmsg);
    }
  }

  @Get('metrics')
  async metrics(@Query() query: InputMap) {
    const shouldReset = pickBoolean(query.reset);
    const data = this.metricsService.snapshot();
    if (shouldReset) {
      this.metricsService.reset();
    }
    return resReturn(data);
  }

  private normalizeSource(source: string | undefined): SpecSource {
    return source === 'url' ? 'url' : 'json';
  }

  private async resolveProjectId(body: InputMap, token: string | undefined): Promise<number> {
    const direct = pickNumber(body.project_id) || pickNumber(body.projectid) || pickNumber(body.id);
    if (direct) return direct;
    return this.projectAuthService.resolveProjectId(undefined, token);
  }

  private normalizeFormat(source: string | undefined): SpecFormat {
    const value = (source || 'auto').toLowerCase();
    if (value === 'swagger2' || value === 'openapi3') return value;
    return 'auto';
  }

  private normalizeSyncMode(source: string | undefined): SyncMode {
    const value = (source || 'merge').toLowerCase();
    if (value === 'normal' || value === 'good' || value === 'sync') return value;
    return 'merge';
  }

  private normalizeExportFormat(source: string | undefined): SpecExportFormat {
    return source === 'swagger2' ? 'swagger2' : 'openapi3';
  }

  private normalizeStatus(source: string | undefined): InterfacePublishStatus {
    return source === 'open' ? 'open' : 'all';
  }

  private parseJson(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch (_err) {
      return text;
    }
  }
}
