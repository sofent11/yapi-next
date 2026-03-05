import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { SyncMode } from '@yapi-next/shared-types';
import { InterfaceEntity } from '../database/schemas/interface.schema';
import { ProjectEntity } from '../database/schemas/project.schema';
import { CounterService } from './counter.service';
import { handleVarPath, normalizePath, verifyPath } from '../common/path-utils';
import { NormalizedApiItem } from './openapi-parser.service';
import { InterfaceTreeCacheService } from './interface-tree-cache.service';
import { mergeJsonSchema } from '../legacy/merge-json-schema';

const BULK_WRITE_CHUNK_SIZE = 300;

export interface BulkUpsertError {
  operationId?: string;
  path?: string;
  method?: string;
  message: string;
}

export interface BulkUpsertResult {
  total: number;
  normalized: number;
  deduped: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  mode: SyncMode;
  errors: BulkUpsertError[];
}

export type RawUpsertItem = Partial<NormalizedApiItem> & {
  catid: number;
  [key: string]: unknown;
};

interface PreparedItem extends Omit<NormalizedApiItem, 'api_opened'> {
  project_id: number;
  catid: number;
  uid: number;
  edit_uid: number;
  add_time: number;
  up_time: number;
  type: string;
  query_path: {
    path: string;
    params: Array<{ name: string; value: string }>;
  };
  api_opened: boolean;
}

@Injectable()
export class InterfaceBulkUpsertService {
  constructor(
    @InjectModel(InterfaceEntity.name)
    private readonly interfaceModel: Model<InterfaceEntity>,
    @InjectModel(ProjectEntity.name)
    private readonly projectModel: Model<ProjectEntity>,
    private readonly counterService: CounterService,
    private readonly cacheService: InterfaceTreeCacheService
  ) {}

  async bulkUpsert(params: {
    projectId: number;
    mode: SyncMode;
    items: RawUpsertItem[];
    uid?: number;
  }): Promise<BulkUpsertResult> {
    const { projectId, mode } = params;
    const uid = typeof params.uid === 'number' ? params.uid : 999999;
    const inputItems = Array.isArray(params.items) ? params.items : [];

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    const errors: BulkUpsertError[] = [];
    const normalizedItems: PreparedItem[] = [];

    for (const rawItem of inputItems) {
      try {
        normalizedItems.push(this.prepareItem(rawItem, projectId, uid));
      } catch (err: any) {
        failed++;
        if (errors.length < 50) {
          errors.push(this.buildErrorItem(rawItem, err.message || 'invalid item'));
        }
      }
    }

    const dedupeMap = new Map<string, PreparedItem>();
    for (const item of normalizedItems) {
      const key = this.lookupKey(item.path, item.method);
      if (dedupeMap.has(key)) {
        skipped++;
      }
      dedupeMap.set(key, item);
    }
    const dedupedItems = Array.from(dedupeMap.values());

    if (dedupedItems.length === 0) {
      return {
        total: inputItems.length,
        normalized: normalizedItems.length,
        deduped: dedupedItems.length,
        created,
        updated,
        skipped,
        failed,
        mode,
        errors
      };
    }

    const existingRows = await this.interfaceModel
      .find({
        project_id: projectId,
        $or: dedupedItems.map(item => ({ path: item.path, method: item.method }))
      })
      .select('_id path method res_body res_body_is_json_schema')
      .lean();
    const existingMap = new Map<string, any>();
    for (const row of existingRows) {
      existingMap.set(this.lookupKey(row.path, row.method), row);
    }

    const createCandidates: PreparedItem[] = [];
    const operations: any[] = [];
    const operationMeta: Array<{ action: 'create' | 'update'; item: PreparedItem }> = [];

    for (const item of dedupedItems) {
      const existing = existingMap.get(this.lookupKey(item.path, item.method));
      if (mode === 'normal') {
        if (existing) {
          skipped++;
          continue;
        }
        createCandidates.push(item);
        continue;
      }

      if (!existing) {
        createCandidates.push(item);
        continue;
      }

      const updateData: Record<string, unknown> = { ...item };
      delete updateData.uid;
      delete updateData.add_time;
      updateData.up_time = this.now();
      if (mode === 'good' && item.res_body_is_json_schema === true && existing.res_body_is_json_schema === true) {
        try {
          const oldBody = this.parseJSON(existing.res_body);
          const newBody = this.parseJSON(item.res_body);
          updateData.res_body = JSON.stringify(mergeJsonSchema(oldBody, newBody), null, 2);
        } catch (_err) {}
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
    }

    if (createCandidates.length > 0) {
      const ids = await this.counterService.nextMany('interface', createCandidates.length, '_id', 11);
      createCandidates.forEach((item, index) => {
        const doc = {
          _id: ids[index],
          ...item
        };
        operations.push({
          insertOne: {
            document: doc
          }
        });
        operationMeta.push({ action: 'create', item });
        created++;
      });
    }

    if (operations.length > 0) {
      for (let start = 0; start < operations.length; start += BULK_WRITE_CHUNK_SIZE) {
        const end = Math.min(start + BULK_WRITE_CHUNK_SIZE, operations.length);
        const chunkOps = operations.slice(start, end);
        const chunkMeta = operationMeta.slice(start, end);
        try {
          await this.interfaceModel.bulkWrite(chunkOps, {
            ordered: false
          });
        } catch (err: any) {
          const writeErrors = err?.writeErrors || [];
          if (writeErrors.length === 0) {
            throw err;
          }
          for (const writeErr of writeErrors) {
            const meta = chunkMeta[writeErr.index];
            if (meta?.action === 'create') {
              created = Math.max(0, created - 1);
            } else if (meta?.action === 'update') {
              updated = Math.max(0, updated - 1);
            }
            failed++;
            if (errors.length < 50) {
              errors.push(
                this.buildErrorItem(
                  meta?.item,
                  writeErr.errmsg || writeErr.message || 'bulk write failed'
                )
              );
            }
          }
        }
      }
    }

    if (created > 0 || updated > 0) {
      await this.projectModel.updateOne(
        { _id: projectId },
        { $set: { up_time: this.now() } }
      );
      this.cacheService.invalidateProject(projectId);
    }

    return {
      total: inputItems.length,
      normalized: normalizedItems.length,
      deduped: dedupedItems.length,
      created,
      updated,
      skipped,
      failed,
      mode,
      errors
    };
  }

  async previewUpsert(params: {
    projectId: number;
    mode: SyncMode;
    items: RawUpsertItem[];
    uid?: number;
  }): Promise<BulkUpsertResult & { dryRun: true }> {
    const { projectId, mode } = params;
    const uid = typeof params.uid === 'number' ? params.uid : 999999;
    const inputItems = Array.isArray(params.items) ? params.items : [];

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    const errors: BulkUpsertError[] = [];
    const normalizedItems: PreparedItem[] = [];

    for (const rawItem of inputItems) {
      try {
        normalizedItems.push(this.prepareItem(rawItem, projectId, uid));
      } catch (err: any) {
        failed++;
        if (errors.length < 50) {
          errors.push(this.buildErrorItem(rawItem, err.message || 'invalid item'));
        }
      }
    }

    const dedupeMap = new Map<string, PreparedItem>();
    for (const item of normalizedItems) {
      const key = this.lookupKey(item.path, item.method);
      if (dedupeMap.has(key)) {
        skipped++;
      }
      dedupeMap.set(key, item);
    }
    const dedupedItems = Array.from(dedupeMap.values());

    if (dedupedItems.length > 0) {
      const existingRows = await this.interfaceModel
        .find({
          project_id: projectId,
          $or: dedupedItems.map(item => ({ path: item.path, method: item.method }))
        })
        .select('_id path method')
        .lean();
      const existingMap = new Map<string, boolean>();
      for (const row of existingRows) {
        existingMap.set(this.lookupKey(row.path, row.method), true);
      }

      for (const item of dedupedItems) {
        const exists = existingMap.has(this.lookupKey(item.path, item.method));
        if (!exists) {
          created++;
          continue;
        }
        if (mode === 'normal') {
          skipped++;
          continue;
        }
        updated++;
      }
    }

    return {
      total: inputItems.length,
      normalized: normalizedItems.length,
      deduped: dedupedItems.length,
      created,
      updated,
      skipped,
      failed,
      mode,
      errors,
      dryRun: true
    };
  }

  private prepareItem(
    rawItem: RawUpsertItem,
    projectId: number,
    uid: number
  ): PreparedItem {
    const now = this.now();
    const pathValue = String(rawItem.path || '').trim();
    const method = String(rawItem.method || 'GET').toUpperCase();
    if (!verifyPath(normalizePath(pathValue).queryPath.path)) {
      throw new Error('path第一位必需为 /, 只允许由 字母数字-/_:.! 组成');
    }
    const reqParams = Array.isArray(rawItem.req_params) ? [...rawItem.req_params] : [];
    handleVarPath(pathValue, reqParams as Array<{ name: string; desc?: string }>);
    const queryData = normalizePath(pathValue);
    const reqHeaders = this.normalizeHeaders(
      rawItem.req_body_type || 'raw',
      Array.isArray(rawItem.req_headers) ? [...rawItem.req_headers] : [],
      Array.isArray(rawItem.req_body_form) ? [...rawItem.req_body_form] : []
    );
    const catid = Number(rawItem.catid);
    if (!catid) {
      throw new Error('catid 不能为空');
    }
    return {
      ...rawItem,
      project_id: projectId,
      catid,
      catname: rawItem.catname ?? null,
      method,
      path: pathValue,
      title: rawItem.title || pathValue,
      desc: rawItem.desc || '',
      req_params: reqParams,
      req_headers: reqHeaders,
      req_query: Array.isArray(rawItem.req_query) ? rawItem.req_query : [],
      req_body_form: Array.isArray(rawItem.req_body_form) ? rawItem.req_body_form : [],
      req_body_type: (rawItem.req_body_type || 'raw').toLowerCase(),
      req_body_other: rawItem.req_body_other || '',
      req_body_is_json_schema: rawItem.req_body_is_json_schema === true,
      res_body_type: (rawItem.res_body_type || 'raw').toLowerCase(),
      res_body: rawItem.res_body || '',
      res_body_is_json_schema: rawItem.res_body_is_json_schema === true,
      operation_oas3: rawItem.operation_oas3 || '',
      import_meta: rawItem.import_meta || '',
      query_path: queryData.queryPath,
      type: reqParams.length > 0 ? 'var' : 'static',
      uid,
      edit_uid: 0,
      add_time: now,
      up_time: now,
      api_opened: rawItem.api_opened === true,
      tag: Array.isArray(rawItem.tag) ? rawItem.tag : []
    };
  }

  private lookupKey(path: string, method: string): string {
    return `${method} ${path}`;
  }

  private now(): number {
    return Math.floor(Date.now() / 1000);
  }

  private parseJSON(input: string): unknown {
    try {
      return JSON.parse(input);
    } catch (_err) {
      return input;
    }
  }

  private buildErrorItem(item: Record<string, any> | undefined, message: string): BulkUpsertError {
    const operationId = this.extractOperationId(item);
    return {
      operationId,
      path: item?.path,
      method: item?.method,
      message
    };
  }

  private extractOperationId(item: Record<string, any> | undefined): string {
    if (!item) return '';
    const meta = this.parseJSON(String(item.import_meta || '')) as Record<string, unknown>;
    if (meta && typeof meta.operationId === 'string') {
      return meta.operationId;
    }
    const operation = this.parseJSON(String(item.operation_oas3 || '')) as Record<string, unknown>;
    if (operation && typeof operation.operationId === 'string') {
      return operation.operationId;
    }
    return '';
  }

  private normalizeHeaders(
    reqBodyType: string,
    reqHeaders: Array<Record<string, any>>,
    reqBodyForm: Array<Record<string, any>>
  ): Array<Record<string, any>> {
    let hasContentType = false;
    let isFile = false;
    if (reqBodyType === 'form') {
      for (const item of reqBodyForm) {
        if (item.type === 'file') isFile = true;
      }
      for (const item of reqHeaders) {
        if (item?.name === 'Content-Type') {
          item.value = isFile ? 'multipart/form-data' : 'application/x-www-form-urlencoded';
          hasContentType = true;
        }
      }
      if (!hasContentType) {
        reqHeaders.unshift({
          name: 'Content-Type',
          value: isFile ? 'multipart/form-data' : 'application/x-www-form-urlencoded'
        });
      }
    } else if (reqBodyType === 'json') {
      for (const item of reqHeaders) {
        if (item?.name === 'Content-Type') {
          item.value = 'application/json';
          hasContentType = true;
        }
      }
      if (!hasContentType) {
        reqHeaders.unshift({
          name: 'Content-Type',
          value: 'application/json'
        });
      }
    }
    return reqHeaders;
  }
}
