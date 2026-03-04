const axios = require('axios');
const yapi = require('../yapi.js');
const baseController = require('./base.js');
const openController = require('./open.js');
const projectModel = require('../models/project.js');
const specImportTaskModel = require('../models/specImportTask.js');
const runSwaggerImport = require('../../exts/yapi-plugin-import-swagger/run.js');
const exportSwaggerController = require('../../exts/yapi-plugin-export-swagger2-data/controller.js');
const metrics = require('../utils/metrics');

function parseJSONSafe(raw, fallback) {
  if (typeof raw !== 'string') {
    return typeof raw === 'undefined' ? fallback : raw;
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

class specController extends baseController {
  constructor(ctx) {
    super(ctx);
    this.projectModel = yapi.getInst(projectModel);
    this.specImportTaskModel = yapi.getInst(specImportTaskModel);
    this.schemaMap = {
      import: {
        project_id: 'number',
        format: {
          type: 'string',
          default: 'auto'
        },
        source: {
          type: 'string',
          default: 'json'
        },
        json: 'string',
        url: 'string',
        syncMode: {
          type: 'string',
          default: 'merge'
        },
        dryRun: {
          type: 'boolean',
          default: false
        },
        dry_run: {
          type: 'boolean',
          default: false
        },
        async: {
          type: 'boolean',
          default: false
        },
        token: 'string'
      },
      export: {
        project_id: 'number',
        format: {
          type: 'string',
          default: 'openapi3'
        },
        status: {
          type: 'string',
          default: 'all'
        },
        withWiki: {
          type: 'boolean',
          default: false
        },
        with_wiki: {
          type: 'boolean',
          default: false
        }
      },
      metrics: {
        reset: {
          type: 'boolean',
          default: false
        }
      },
      task: {
        '*task_id': 'number'
      },
      tasks: {
        '*project_id': 'number',
        page: {
          type: 'number',
          default: 1
        },
        limit: {
          type: 'number',
          default: 20
        }
      },
      taskDownload: {
        '*task_id': 'number'
      }
    };
  }

  normalizeTask(task) {
    if (!task) return null;
    const data = task.toObject ? task.toObject() : task;
    return {
      task_id: data._id,
      project_id: data.project_id,
      uid: data.uid,
      status: data.status,
      progress: data.progress,
      stage: data.stage,
      message: data.message,
      request_payload: parseJSONSafe(data.request_payload, null),
      result: parseJSONSafe(data.result, null),
      error: parseJSONSafe(data.error, null),
      add_time: data.add_time,
      up_time: data.up_time
    };
  }

  async runImportTask(taskId, params, recordMetric) {
    const now = () => yapi.commons.time();
    const updateTask = payload =>
      this.specImportTaskModel.up(taskId, Object.assign({}, payload, { up_time: now() }));

    try {
      await updateTask({
        status: 'running',
        progress: 5,
        stage: 'prepare',
        message: '任务开始执行'
      });
      const parsed = await runSwaggerImport(params.specRaw);
      await updateTask({
        progress: 35,
        stage: 'parse',
        message: `解析完成，检测到 ${parsed.apis.length} 个接口`
      });

      const openInst = new openController(this.ctx);
      openInst.$auth = true;
      openInst.$uid = this.$uid;
      openInst.$user = this.$user;
      openInst.$tokenAuth = this.$tokenAuth;

      const importCtx = {
        params: {
          type: 'swagger',
          project_id: params.project_id,
          json: params.specRaw,
          merge: params.syncMode,
          token: params.token
        },
        request: {
          header: {
            cookie: params.requestCookie || ''
          }
        }
      };

      await updateTask({
        progress: 60,
        stage: 'write',
        message: '正在写入接口数据'
      });
      await openInst.importData(importCtx);
      const importBody = importCtx.body || {};
      if (importBody.errcode === 0) {
        metrics.incCounter(
          'yapi_spec_import_items_total',
          { detectedFormat: params.detectedFormat, syncMode: params.syncMode },
          1
        );
        await updateTask({
          status: 'success',
          progress: 100,
          stage: 'done',
          message: importBody.errmsg || '导入成功',
          result: JSON.stringify({
            errcode: importBody.errcode,
            errmsg: importBody.errmsg,
            data: importBody.data || null
          }),
          error: ''
        });
        recordMetric('ok');
      } else {
        await updateTask({
          status: 'failed',
          progress: 100,
          stage: 'done',
          message: importBody.errmsg || '导入失败',
          error: JSON.stringify({
            errcode: importBody.errcode || 400,
            errmsg: importBody.errmsg || '导入失败',
            data: importBody.data || null
          })
        });
        recordMetric('error');
      }
    } catch (err) {
      await updateTask({
        status: 'failed',
        progress: 100,
        stage: 'done',
        message: '导入任务执行失败',
        error: JSON.stringify({
          message: err && err.message ? err.message : String(err),
          stack: err && err.stack ? err.stack : ''
        })
      });
      recordMetric('error');
    }
  }

  async import(ctx) {
    const projectId = ctx.params.project_id;
    const source = ctx.params.source || 'json';
    const format = (ctx.params.format || 'auto').toLowerCase();
    const syncMode = ['normal', 'good', 'merge'].includes(ctx.params.syncMode)
      ? ctx.params.syncMode
      : 'merge';
    const token = ctx.params.token;
    const dryRun = ctx.params.dryRun === true || ctx.params.dry_run === true;
    const asyncMode = ctx.params.async === true;
    const startedAt = Date.now();
    const recordMetric = status => {
      metrics.incCounter('yapi_spec_import_requests_total', { status, dryRun }, 1);
      metrics.observeHistogram('yapi_spec_import_duration_ms', Date.now() - startedAt, {
        status,
        dryRun
      });
    };

    if (!projectId) {
      recordMetric('reject');
      return (ctx.body = yapi.commons.resReturn(null, 400, 'project_id 不能为空'));
    }
    if (!this.$tokenAuth) {
      const auth = await this.checkAuth(projectId, 'project', 'edit');
      if (!auth) {
        recordMetric('reject');
        return (ctx.body = yapi.commons.resReturn(null, 40033, '没有权限'));
      }
    }

    let content = ctx.params.json;
    if (source === 'url') {
      const url = ctx.params.url || ctx.params.json;
      if (!url) {
        recordMetric('reject');
        return (ctx.body = yapi.commons.resReturn(null, 400, 'url 不能为空'));
      }
      try {
        const response = await axios.get(url, { timeout: 30000 });
        content = JSON.stringify(response.data);
      } catch (err) {
        recordMetric('error');
        return (ctx.body = yapi.commons.resReturn(null, 400, '读取 url 失败: ' + err.message));
      }
    }

    if (!content) {
      recordMetric('reject');
      return (ctx.body = yapi.commons.resReturn(null, 400, 'json 或 url 不能为空'));
    }

    const parsedSpec = this.parseSpec(content);
    if (!parsedSpec.valid) {
      recordMetric('reject');
      return (ctx.body = yapi.commons.resReturn(null, 400, parsedSpec.message));
    }

    const detectedFormat = this.detectSpecFormat(parsedSpec.data);
    if (detectedFormat === 'unknown') {
      recordMetric('reject');
      return (ctx.body = yapi.commons.resReturn(
        null,
        400,
        '仅支持 Swagger 2.x 或 OpenAPI 3.x 规范'
      ));
    }
    if (format !== 'auto' && format !== detectedFormat) {
      recordMetric('reject');
      return (ctx.body = yapi.commons.resReturn(
        null,
        400,
        `format 与文档版本不匹配，当前检测为 ${detectedFormat}`
      ));
    }

    if (dryRun) {
      try {
        const parsed = await runSwaggerImport(parsedSpec.raw);
        recordMetric('ok');
        return (ctx.body = yapi.commons.resReturn({
          dryRun: true,
          project_id: projectId,
          detectedFormat,
          categories: parsed.cats.length,
          interfaces: parsed.apis.length,
          basePath: parsed.basePath || '',
          sample: parsed.apis.slice(0, 5).map(item => ({
            method: item.method,
            path: item.path,
            title: item.title
          }))
        }));
      } catch (err) {
        recordMetric('error');
        return (ctx.body = yapi.commons.resReturn(null, 400, err.message));
      }
    }

    if (asyncMode) {
      try {
        const addTime = yapi.commons.time();
        const uid = this.getUid();
        const task = await this.specImportTaskModel.save({
          project_id: projectId,
          uid: Number.isFinite(uid) ? uid : 0,
          status: 'queued',
          progress: 0,
          stage: 'queued',
          message: '导入任务已创建',
          request_payload: JSON.stringify({
            format,
            source,
            syncMode,
            detectedFormat
          }),
          add_time: addTime,
          up_time: addTime
        });

        metrics.incCounter('yapi_spec_import_requests_total', { status: 'accepted', dryRun }, 1);
        ctx.body = yapi.commons.resReturn(
          {
            task_id: task._id,
            status: 'queued',
            progress: 0,
            message: '导入任务已创建'
          },
          0,
          '导入任务已创建'
        );

        const requestCookie =
          (ctx.request && ctx.request.header && ctx.request.header.cookie) || '';
        setImmediate(() => {
          this.runImportTask(
            task._id,
            {
              project_id: projectId,
              syncMode,
              token,
              specRaw: parsedSpec.raw,
              detectedFormat,
              requestCookie
            },
            recordMetric
          );
        });
        return;
      } catch (err) {
        recordMetric('error');
        return (ctx.body = yapi.commons.resReturn(null, 400, err.message || '创建导入任务失败'));
      }
    }

    const openInst = new openController(ctx);
    openInst.$auth = true;
    openInst.$uid = this.$uid;
    openInst.$user = this.$user;
    openInst.$tokenAuth = this.$tokenAuth;

    const importCtx = {
      params: {
        type: 'swagger',
        project_id: projectId,
        json: parsedSpec.raw,
        merge: syncMode,
        token
      }
    };
    await openInst.importData(importCtx);
    metrics.incCounter('yapi_spec_import_items_total', { detectedFormat, syncMode }, importCtx.body && importCtx.body.errcode === 0 ? 1 : 0);
    recordMetric(importCtx.body && importCtx.body.errcode === 0 ? 'ok' : 'error');
    ctx.body = importCtx.body;
  }

  async task(ctx) {
    const task = await this.specImportTaskModel.get(ctx.params.task_id);
    if (!task) {
      return (ctx.body = yapi.commons.resReturn(null, 404, '导入任务不存在'));
    }
    if (this.$tokenAuth) {
      const tokenProjectId = parseInt(ctx.params.project_id, 10);
      if (!tokenProjectId || tokenProjectId !== task.project_id) {
        return (ctx.body = yapi.commons.resReturn(null, 40033, '没有权限'));
      }
    } else {
      const auth = await this.checkAuth(task.project_id, 'project', 'view');
      if (!auth) {
        return (ctx.body = yapi.commons.resReturn(null, 40033, '没有权限'));
      }
    }

    ctx.body = yapi.commons.resReturn(this.normalizeTask(task));
  }

  async tasks(ctx) {
    const projectId = parseInt(ctx.params.project_id, 10);
    const page = Math.max(1, parseInt(ctx.params.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(ctx.params.limit, 10) || 20));

    if (this.$tokenAuth) {
      const tokenProjectId = parseInt(ctx.params.project_id, 10);
      if (!tokenProjectId || tokenProjectId !== projectId) {
        return (ctx.body = yapi.commons.resReturn(null, 40033, '没有权限'));
      }
    } else {
      const auth = await this.checkAuth(projectId, 'project', 'view');
      if (!auth) {
        return (ctx.body = yapi.commons.resReturn(null, 40033, '没有权限'));
      }
    }

    const [list, total] = await Promise.all([
      this.specImportTaskModel.listByProject(projectId, page, limit),
      this.specImportTaskModel.countByProject(projectId)
    ]);
    ctx.body = yapi.commons.resReturn({
      list: list.map(item => this.normalizeTask(item)),
      pagination: {
        total,
        page,
        limit
      }
    });
  }

  async taskDownload(ctx) {
    const task = await this.specImportTaskModel.get(ctx.params.task_id);
    if (!task) {
      return (ctx.body = yapi.commons.resReturn(null, 404, '导入任务不存在'));
    }
    if (this.$tokenAuth) {
      const tokenProjectId = parseInt(ctx.params.project_id, 10);
      if (!tokenProjectId || tokenProjectId !== task.project_id) {
        return (ctx.body = yapi.commons.resReturn(null, 40033, '没有权限'));
      }
    } else {
      const auth = await this.checkAuth(task.project_id, 'project', 'view');
      if (!auth) {
        return (ctx.body = yapi.commons.resReturn(null, 40033, '没有权限'));
      }
    }

    const payload = this.normalizeTask(task);
    ctx.set('Content-Type', 'application/json; charset=utf-8');
    ctx.set('Content-Disposition', `attachment; filename="spec-import-task-${payload.task_id}.json"`);
    ctx.body = JSON.stringify(payload, null, 2);
  }

  async export(ctx) {
    const projectId = ctx.params.project_id;
    const format = (ctx.params.format || 'openapi3').toLowerCase();
    const status = ctx.params.status || 'all';
    const startedAt = Date.now();
    const recordMetric = metricStatus => {
      metrics.incCounter('yapi_spec_export_requests_total', { format, status: metricStatus }, 1);
      metrics.observeHistogram('yapi_spec_export_duration_ms', Date.now() - startedAt, {
        format,
        status: metricStatus
      });
    };

    if (!projectId) {
      recordMetric('reject');
      return (ctx.body = yapi.commons.resReturn(null, 400, 'project_id 不能为空'));
    }

    const projectData = await this.projectModel.get(projectId);
    if (!projectData) {
      recordMetric('reject');
      return (ctx.body = yapi.commons.resReturn(null, 404, '项目不存在'));
    }
    if (projectData.project_type === 'private') {
      if ((await this.checkAuth(projectData._id, 'project', 'view')) !== true) {
        recordMetric('reject');
        return (ctx.body = yapi.commons.resReturn(null, 406, '没有权限'));
      }
    }

    const type = format === 'swagger2' ? 'OpenAPIV2' : 'OpenAPIV3';
    const exporter = new exportSwaggerController(ctx);
    const exportCtx = {
      request: {
        query: {
          pid: projectId,
          type,
          status
        }
      },
      set: (...args) => ctx.set.apply(ctx, args),
      body: null
    };
    await exporter.exportData(exportCtx);
    recordMetric(typeof exportCtx.body === 'string' && exportCtx.body.length > 0 ? 'ok' : 'error');
    ctx.body = exportCtx.body;
  }

  async metrics(ctx) {
    if (this.getRole() !== 'admin') {
      return (ctx.body = yapi.commons.resReturn(null, 40033, '没有权限'));
    }
    const reset = ctx.params.reset === true;
    const data = metrics.snapshot();
    if (reset) {
      metrics.reset();
    }
    ctx.body = yapi.commons.resReturn(data);
  }

  parseSpec(content) {
    try {
      const data = typeof content === 'string' ? JSON.parse(content) : content;
      if (!data || typeof data !== 'object') {
        return { valid: false, message: '规范内容必须是 JSON 对象' };
      }
      return {
        valid: true,
        data,
        raw: JSON.stringify(data)
      };
    } catch (err) {
      return {
        valid: false,
        message: '规范内容 JSON 解析失败: ' + err.message
      };
    }
  }

  detectSpecFormat(spec) {
    if (spec && typeof spec.openapi === 'string' && /^3\./.test(spec.openapi)) {
      return 'openapi3';
    }
    if (spec && typeof spec.swagger === 'string' && /^2\./.test(spec.swagger)) {
      return 'swagger2';
    }
    return 'unknown';
  }
}

module.exports = specController;
