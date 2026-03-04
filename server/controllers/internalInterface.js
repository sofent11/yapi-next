const url = require('url');
const yapi = require('../yapi.js');
const baseController = require('./base.js');
const interfaceModel = require('../models/interface.js');
const projectModel = require('../models/project.js');
const mergeJsonSchema = require('../../common/mergeJsonSchema');
const metrics = require('../utils/metrics');
const BULK_WRITE_CHUNK_SIZE = 300;

const INSERT_FIELDS = [
  'title',
  'uid',
  'path',
  'method',
  'project_id',
  'catid',
  'edit_uid',
  'status',
  'desc',
  'markdown',
  'add_time',
  'up_time',
  'type',
  'query_path',
  'req_query',
  'req_headers',
  'req_params',
  'req_body_type',
  'req_body_is_json_schema',
  'req_body_form',
  'req_body_other',
  'res_body_type',
  'res_body',
  'res_body_is_json_schema',
  'operation_oas3',
  'import_meta',
  'custom_field_value',
  'field2',
  'field3',
  'api_opened',
  'index',
  'tag'
];

function parseJSONSafe(text, defaultValue) {
  if (!text || typeof text !== 'string') {
    return defaultValue;
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    return defaultValue;
  }
}

function extractOperationId(item) {
  const fromMeta = parseJSONSafe(item.import_meta, null);
  if (fromMeta && fromMeta.operationId) {
    return fromMeta.operationId;
  }

  const fromOp = parseJSONSafe(item.operation_oas3, null);
  if (fromOp && fromOp.operationId) {
    return fromOp.operationId;
  }
  return '';
}

function buildErrorItem(item, message) {
  return {
    operationId: extractOperationId(item) || '',
    path: item.path,
    method: item.method,
    message
  };
}

function normalizeHeaders(values) {
  let isFile = false;
  let hasContentType = false;
  const reqHeaders = Array.isArray(values.req_headers) ? values.req_headers : [];
  values.req_headers = reqHeaders;

  if (values.req_body_type === 'form') {
    const reqBodyForm = Array.isArray(values.req_body_form) ? values.req_body_form : [];
    reqBodyForm.forEach(item => {
      if (item.type === 'file') {
        isFile = true;
      }
    });
    values.req_body_form = reqBodyForm;

    reqHeaders.forEach(item => {
      if (item && item.name === 'Content-Type') {
        item.value = isFile ? 'multipart/form-data' : 'application/x-www-form-urlencoded';
        hasContentType = true;
      }
    });
    if (hasContentType === false) {
      reqHeaders.unshift({
        name: 'Content-Type',
        value: isFile ? 'multipart/form-data' : 'application/x-www-form-urlencoded'
      });
    }
  } else if (values.req_body_type === 'json') {
    reqHeaders.forEach(item => {
      if (item && item.name === 'Content-Type') {
        item.value = 'application/json';
        hasContentType = true;
      }
    });
    if (hasContentType === false) {
      reqHeaders.unshift({
        name: 'Content-Type',
        value: 'application/json'
      });
    }
  }
}

function pickInsertFields(data) {
  const result = {};
  INSERT_FIELDS.forEach(key => {
    if (!Object.prototype.hasOwnProperty.call(data, key)) {
      return;
    }
    result[key] = data[key];
  });
  return result;
}

class internalInterfaceController extends baseController {
  constructor(ctx) {
    super(ctx);
    this.Model = yapi.getInst(interfaceModel);
    this.projectModel = yapi.getInst(projectModel);
    this.schemaMap = {
      bulkUpsert: {
        '*project_id': 'number',
        '*items': 'array',
        mode: {
          type: 'string',
          default: 'merge'
        },
        dry_run: {
          type: 'boolean',
          default: false
        },
        dryRun: {
          type: 'boolean',
          default: false
        }
      }
    };
  }

  normalizeItem(rawItem, projectId) {
    const item = Object.assign({}, rawItem || {});
    item.project_id = projectId;
    item.path = (item.path || '').trim();
    item.method = String(item.method || 'GET').toUpperCase();
    item.title = item.title || item.operationId || item.path || '未命名接口';
    item.req_params = Array.isArray(item.req_params) ? item.req_params : [];
    item.req_headers = Array.isArray(item.req_headers) ? item.req_headers : [];
    item.req_query = Array.isArray(item.req_query) ? item.req_query : [];
    item.req_body_form = Array.isArray(item.req_body_form) ? item.req_body_form : [];
    item.tag = Array.isArray(item.tag) ? item.tag : [];
    item.req_body_type = (item.req_body_type || 'raw').toLowerCase();
    item.res_body_type = (item.res_body_type || 'json').toLowerCase();
    item.req_body_is_json_schema = item.req_body_is_json_schema === true;
    item.res_body_is_json_schema = item.res_body_is_json_schema === true;
    item.api_opened = item.api_opened === true;

    const parsed = url.parse(item.path, true);
    if (!yapi.commons.verifyPath(parsed.pathname)) {
      throw new Error('path第一位必需为 /, 只允许由 字母数字-/_:.! 组成');
    }
    item.query_path = {
      path: parsed.pathname,
      params: Object.keys(parsed.query || {}).map(name => ({
        name,
        value: parsed.query[name]
      }))
    };

    yapi.commons.handleVarPath(item.path, item.req_params);
    item.type = item.req_params.length > 0 ? 'var' : 'static';
    normalizeHeaders(item);

    if (item.catid && !Number.isInteger(item.catid)) {
      const parsedCatid = parseInt(item.catid, 10);
      if (!Number.isNaN(parsedCatid)) {
        item.catid = parsedCatid;
      }
    }

    const now = yapi.commons.time();
    item.uid = this.getUid();
    item.edit_uid = 0;
    item.add_time = now;
    item.up_time = now;
    return item;
  }

  buildLookupKey(pathname, method) {
    return `${method} ${pathname}`;
  }

  async syncProjectTags(projectId, items) {
    const tags = new Set();
    items.forEach(item => {
      (item.tag || []).forEach(tag => {
        if (typeof tag === 'string' && tag.trim()) {
          tags.add(tag.trim());
        }
      });
    });
    if (tags.size === 0) return false;

    const project = await this.projectModel.get(projectId);
    if (!project) return false;
    const currentTags = Array.isArray(project.tag) ? project.tag : [];
    const tagMap = new Set(currentTags.map(tag => (tag && tag.name ? tag.name : '')));
    let changed = false;
    tags.forEach(name => {
      if (!tagMap.has(name)) {
        currentTags.push({
          name,
          desc: name
        });
        changed = true;
      }
    });
    if (changed) {
      await this.projectModel.up(projectId, {
        tag: currentTags
      });
    }
    return changed;
  }

  async bulkUpsert(ctx) {
    const project_id = ctx.params.project_id;
    const items = Array.isArray(ctx.params.items) ? ctx.params.items : [];
    const mode = ['normal', 'good', 'merge'].includes(ctx.params.mode) ? ctx.params.mode : 'merge';
    const dryRun = ctx.params.dry_run === true || ctx.params.dryRun === true;
    const startedAt = Date.now();
    const recordMetric = status => {
      metrics.incCounter('yapi_bulk_upsert_requests_total', { mode, status }, 1);
      metrics.observeHistogram('yapi_bulk_upsert_duration_ms', Date.now() - startedAt, {
        mode,
        status
      });
    };

    try {
      if (!project_id) {
        recordMetric('reject');
        return (ctx.body = yapi.commons.resReturn(null, 400, 'project_id 不能为空'));
      }

      if (!this.$tokenAuth) {
        const auth = await this.checkAuth(project_id, 'project', 'edit');
        if (!auth) {
          recordMetric('reject');
          return (ctx.body = yapi.commons.resReturn(null, 40033, '没有权限'));
        }
      }

      if (items.length === 0) {
        recordMetric('ok');
        return (ctx.body = yapi.commons.resReturn({
          total: 0,
          created: 0,
          updated: 0,
          skipped: 0,
          failed: 0,
          mode
        }));
      }

      let created = 0;
      let updated = 0;
      let skipped = 0;
      let failed = 0;
      const errors = [];
      const normalizedItems = [];

      items.forEach(rawItem => {
        try {
          normalizedItems.push(this.normalizeItem(rawItem, project_id));
        } catch (err) {
          failed++;
          if (errors.length < 50) {
            errors.push(buildErrorItem(rawItem || {}, err.message));
          }
        }
      });

      if (normalizedItems.length === 0) {
        recordMetric('reject');
        return (ctx.body = yapi.commons.resReturn({
          total: items.length,
          created: 0,
          updated: 0,
          skipped: 0,
          failed,
          mode,
          errors
        }));
      }

      const normalizedByKey = new Map();
      normalizedItems.forEach(item => {
        const key = this.buildLookupKey(item.path, item.method);
        if (normalizedByKey.has(key)) {
          skipped++;
        }
        normalizedByKey.set(key, item);
      });
      const dedupedItems = Array.from(normalizedByKey.values());

      const lookupOr = dedupedItems.map(item => ({
        path: item.path,
        method: item.method
      }));
      const existingRows = await this.Model.model
        .find({
          project_id,
          $or: lookupOr
        })
        .select('_id path method res_body res_body_is_json_schema')
        .lean();
      const existingMap = new Map();
      existingRows.forEach(row => {
        existingMap.set(this.buildLookupKey(row.path, row.method), row);
      });

      const operations = [];
      const operationMeta = [];
      dedupedItems.forEach(item => {
        const key = this.buildLookupKey(item.path, item.method);
        const existing = existingMap.get(key);
        if (mode === 'normal') {
          if (existing) {
            skipped++;
            return;
          }
          operations.push({
            insertOne: {
              document: pickInsertFields(item)
            }
          });
          operationMeta.push({ action: 'create', item });
          created++;
          return;
        }

        if (!existing) {
          operations.push({
            insertOne: {
              document: pickInsertFields(item)
            }
          });
          operationMeta.push({ action: 'create', item });
          created++;
          return;
        }

        const updateData = pickInsertFields(item);
        delete updateData.uid;
        delete updateData.add_time;
        updateData.up_time = yapi.commons.time();

        if (mode === 'good' && item.res_body_is_json_schema === true && existing.res_body_is_json_schema === true) {
          try {
            const oldResBody = yapi.commons.json_parse(existing.res_body);
            const newResBody = yapi.commons.json_parse(item.res_body);
            updateData.res_body = JSON.stringify(mergeJsonSchema(oldResBody, newResBody), null, 2);
          } catch (err) {}
        }

        operations.push({
          updateOne: {
            filter: { _id: existing._id },
            update: { $set: updateData },
            upsert: false
          }
        });
        operationMeta.push({ action: 'update', item });
        updated++;
      });

      if (dryRun) {
        recordMetric('ok');
        return (ctx.body = yapi.commons.resReturn({
          total: items.length,
          normalized: normalizedItems.length,
          deduped: dedupedItems.length,
          created,
          updated,
          skipped,
          failed,
          mode,
          dry_run: true,
          errors
        }));
      }

      if (operations.length > 0) {
        for (let start = 0; start < operations.length; start += BULK_WRITE_CHUNK_SIZE) {
          const end = Math.min(start + BULK_WRITE_CHUNK_SIZE, operations.length);
          const chunkOps = operations.slice(start, end);
          const chunkMeta = operationMeta.slice(start, end);
          try {
            await this.Model.model.bulkWrite(chunkOps, {
              ordered: false
            });
          } catch (err) {
            const writeErrors = (err && err.writeErrors) || [];
            if (writeErrors.length === 0) {
              throw err;
            }
            writeErrors.forEach(writeErr => {
              const meta = chunkMeta[writeErr.index];
              if (meta && meta.action === 'create') {
                created = Math.max(0, created - 1);
              } else if (meta && meta.action === 'update') {
                updated = Math.max(0, updated - 1);
              }
              failed++;
              if (errors.length < 50) {
                errors.push(
                  buildErrorItem(
                    (meta && meta.item) || {},
                    writeErr.errmsg || writeErr.message || 'bulk write failed'
                  )
                );
              }
            });
          }
        }
      }

      if (created > 0 || updated > 0) {
        const tagChanged = await this.syncProjectTags(project_id, dedupedItems);
        if (!tagChanged) {
          await this.projectModel.up(project_id, { up_time: yapi.commons.time() });
        }
      }

      ctx.body = yapi.commons.resReturn({
        total: items.length,
        normalized: normalizedItems.length,
        deduped: dedupedItems.length,
        created,
        updated,
        skipped,
        failed,
        mode,
        errors
      });
      recordMetric('ok');
    } catch (err) {
      recordMetric('error');
      throw err;
    }
  }
}

module.exports = internalInterfaceController;
