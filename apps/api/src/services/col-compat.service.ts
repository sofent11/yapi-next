import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ApiResponse, resReturn } from '../common/api-response';
import { CounterService } from './counter.service';
import { ProjectCompatService } from './project-compat.service';
import { SessionUser } from './session-auth.service';
import { InterfaceCaseEntity } from '../database/schemas/interface-case.schema';
import { InterfaceColEntity } from '../database/schemas/interface-col.schema';
import { InterfaceEntity } from '../database/schemas/interface.schema';
import { ProjectEntity } from '../database/schemas/project.schema';

type AccessOptions = {
  user?: SessionUser | null;
  token?: string;
};

@Injectable()
export class ColCompatService {
  constructor(
    @InjectModel(InterfaceColEntity.name)
    private readonly colModel: Model<InterfaceColEntity>,
    @InjectModel(InterfaceCaseEntity.name)
    private readonly caseModel: Model<InterfaceCaseEntity>,
    @InjectModel(InterfaceEntity.name)
    private readonly interfaceModel: Model<InterfaceEntity>,
    @InjectModel(ProjectEntity.name)
    private readonly projectModel: Model<ProjectEntity>,
    private readonly counterService: CounterService,
    private readonly projectService: ProjectCompatService
  ) {}

  async list(projectId: number, access: AccessOptions): Promise<Array<Record<string, unknown>>> {
    await this.projectService.assertProjectPermission(projectId, 'view', access);
    const cols = await this.colModel.find({ project_id: projectId }).sort({ index: 1, _id: 1 }).lean();
    if (cols.length === 0) return [];

    const colIds = cols.map(item => item._id);
    const caseRows = await this.caseModel.find({ col_id: { $in: colIds } }).sort({ index: 1, _id: 1 }).lean();
    const interfaceIds = Array.from(
      new Set(caseRows.map(item => Number(item.interface_id)).filter(item => Number.isFinite(item)))
    );
    const interfaceRows =
      interfaceIds.length > 0
        ? await this.interfaceModel
            .find({ _id: { $in: interfaceIds } })
            .select('_id path')
            .lean()
        : [];
    const interfaceMap = new Map<number, { path?: string }>();
    interfaceRows.forEach(item => interfaceMap.set(Number(item._id), { path: item.path }));

    const byCol = new Map<number, Array<Record<string, unknown>>>();
    caseRows.forEach(item => {
      const output = {
        ...item,
        path: interfaceMap.get(Number(item.interface_id))?.path || ''
      };
      if (!byCol.has(item.col_id)) {
        byCol.set(item.col_id, []);
      }
      byCol.get(item.col_id)?.push(output);
    });

    return cols.map(col => ({
      ...col,
      caseList: byCol.get(col._id) || []
    }));
  }

  async addCol(
    payload: {
      name: string;
      project_id: number;
      desc?: string;
    },
    access: AccessOptions
  ): Promise<Record<string, unknown>> {
    await this.projectService.assertProjectPermission(payload.project_id, 'edit', access);
    const now = this.now();
    const row: InterfaceColEntity = {
      _id: await this.counterService.next('interface_col', '_id', 11),
      name: payload.name,
      project_id: payload.project_id,
      desc: payload.desc || '',
      uid: this.actorUid(access.user),
      index: 0,
      add_time: now,
      up_time: now,
      test_report: '{}',
      checkHttpCodeIs200: false,
      checkResponseSchema: false,
      checkResponseField: { name: 'code', value: '0', enable: false },
      checkScript: { content: '', enable: false }
    };
    const created = await this.colModel.create(row);
    return created.toObject() as unknown as Record<string, unknown>;
  }

  async getCaseList(colId: number, access: AccessOptions): Promise<Array<Record<string, unknown>>> {
    const col = await this.requireCol(colId);
    await this.projectService.assertProjectPermission(col.project_id, 'view', access);
    const list = await this.caseModel.find({ col_id: colId }).sort({ index: 1, _id: 1 }).lean();
    if (list.length === 0) return [];
    const interfaceIds = Array.from(
      new Set(list.map(item => Number(item.interface_id)).filter(item => Number.isFinite(item)))
    );
    const interfaceRows =
      interfaceIds.length > 0
        ? await this.interfaceModel
            .find({ _id: { $in: interfaceIds } })
            .select('_id path method title')
            .lean()
        : [];
    const interfaceMap = new Map<number, Record<string, unknown>>();
    interfaceRows.forEach(item =>
      interfaceMap.set(Number(item._id), {
        path: item.path || '',
        method: item.method || '',
        title: item.title || ''
      })
    );
    return list.map(item => ({
      ...item,
      ...(interfaceMap.get(Number(item.interface_id)) || {})
    }));
  }

  async getCaseEnvList(colId: number, access: AccessOptions): Promise<Array<Record<string, unknown>>> {
    const col = await this.requireCol(colId);
    await this.projectService.assertProjectPermission(col.project_id, 'view', access);
    const caseRows = await this.caseModel.find({ col_id: colId }).select('project_id').lean();
    const projectIds = Array.from(
      new Set(caseRows.map(item => Number(item.project_id)).filter(item => Number.isFinite(item)))
    );
    if (projectIds.length === 0) return [];
    const projectRows = await this.projectModel
      .find({ _id: { $in: projectIds } })
      .select('_id name env')
      .lean();
    return projectRows.map(item => ({
      _id: item._id,
      name: item.name || '',
      env: Array.isArray(item.env) ? item.env : []
    }));
  }

  async getCaseListByVariableParams(
    colId: number,
    access: AccessOptions
  ): Promise<Array<Record<string, unknown>>> {
    const list = await this.getCaseList(colId, access);
    if (list.length === 0) return [];

    const output: Array<Record<string, unknown>> = [];
    for (const row of list) {
      const interfaceId = Number(row.interface_id);
      const interfaceData = await this.interfaceModel.findOne({ _id: interfaceId }).lean();
      if (!interfaceData) continue;
      const body = this.parseJsonObject(interfaceData.res_body);
      const pathParams = this.paramsToObject(interfaceData.req_params);
      const queryParams = this.paramsToObject(interfaceData.req_query);
      const bodyParams =
        interfaceData.req_body_type === 'form'
          ? this.paramsToObject(interfaceData.req_body_form)
          : this.parseJsonObject(interfaceData.req_body_other);
      output.push({
        _id: row._id,
        casename: row.casename,
        index: row.index || 0,
        body,
        params: {
          ...pathParams,
          ...queryParams,
          ...bodyParams
        }
      });
    }
    return output;
  }

  async addCase(
    payload: {
      casename: string;
      project_id: number;
      col_id: number;
      interface_id: number;
      case_env?: string;
      req_params?: Array<Record<string, unknown>>;
      req_headers?: Array<Record<string, unknown>>;
      req_query?: Array<Record<string, unknown>>;
      req_body_form?: Array<Record<string, unknown>>;
      req_body_other?: string;
      req_body_type?: string;
      test_script?: string;
      enable_script?: boolean;
    },
    access: AccessOptions
  ): Promise<Record<string, unknown>> {
    await this.projectService.assertProjectPermission(payload.project_id, 'edit', access);
    await this.requireCol(payload.col_id);
    await this.requireInterface(payload.interface_id);
    const now = this.now();
    const doc = await this.caseModel.create({
      casename: payload.casename,
      project_id: payload.project_id,
      col_id: payload.col_id,
      interface_id: payload.interface_id,
      case_env: payload.case_env || '',
      req_params: Array.isArray(payload.req_params) ? payload.req_params : [],
      req_headers: Array.isArray(payload.req_headers) ? payload.req_headers : [],
      req_query: Array.isArray(payload.req_query) ? payload.req_query : [],
      req_body_form: Array.isArray(payload.req_body_form) ? payload.req_body_form : [],
      req_body_other: payload.req_body_other || '',
      req_body_type: payload.req_body_type || 'raw',
      test_script: payload.test_script || '',
      enable_script: Boolean(payload.enable_script),
      uid: this.actorUid(access.user),
      index: 0,
      add_time: now,
      up_time: now
    });
    await this.touchProject(payload.project_id);
    return doc.toObject() as unknown as Record<string, unknown>;
  }

  async addCaseList(
    payload: {
      project_id: number;
      col_id: number;
      interface_list: number[];
    },
    access: AccessOptions
  ): Promise<string> {
    await this.projectService.assertProjectPermission(payload.project_id, 'edit', access);
    await this.requireCol(payload.col_id);
    const interfaces = await this.interfaceModel
      .find({ _id: { $in: payload.interface_list } })
      .select('_id title req_body_other req_body_type req_body_form req_query req_headers req_params')
      .lean();
    const now = this.now();
    for (const item of interfaces) {
      await this.caseModel.create({
        casename: item.title || `case-${item._id}`,
        uid: this.actorUid(access.user),
        col_id: payload.col_id,
        project_id: payload.project_id,
        interface_id: Number(item._id),
        index: 0,
        add_time: now,
        up_time: now,
        req_body_other: item.req_body_other || '',
        req_body_type: item.req_body_type || 'raw',
        req_body_form: Array.isArray(item.req_body_form) ? item.req_body_form : [],
        req_query: Array.isArray(item.req_query) ? item.req_query : [],
        req_headers: Array.isArray(item.req_headers) ? item.req_headers : [],
        req_params: Array.isArray(item.req_params) ? item.req_params : []
      });
    }
    await this.touchProject(payload.project_id);
    return 'ok';
  }

  async cloneCaseList(
    payload: {
      project_id: number;
      col_id: number;
      new_col_id: number;
    },
    access: AccessOptions
  ): Promise<string> {
    await this.projectService.assertProjectPermission(payload.project_id, 'edit', access);
    await this.requireCol(payload.col_id);
    await this.requireCol(payload.new_col_id);
    const oldRows = await this.caseModel.find({ col_id: payload.col_id }).sort({ index: 1, _id: 1 }).lean();
    const now = this.now();
    for (const row of oldRows) {
      const copy = { ...row };
      delete (copy as Record<string, unknown>)._id;
      await this.caseModel.create({
        ...copy,
        col_id: payload.new_col_id,
        add_time: now,
        up_time: now
      });
    }
    await this.touchProject(payload.project_id);
    return 'ok';
  }

  async upCase(
    id: string,
    payload: Record<string, unknown>,
    access: AccessOptions
  ): Promise<Record<string, unknown>> {
    const caseData = await this.requireCase(id);
    await this.projectService.assertProjectPermission(caseData.project_id, 'edit', access);
    const updates: Record<string, unknown> = { ...payload };
    delete updates.id;
    delete updates._id;
    delete updates.interface_id;
    delete updates.project_id;
    updates.uid = this.actorUid(access.user);
    updates.up_time = this.now();
    const result = await this.caseModel.updateOne({ _id: caseData._id }, { $set: updates });
    await this.touchProject(caseData.project_id);
    return {
      acknowledged: result.acknowledged,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount
    };
  }

  async getCase(caseId: string, access: AccessOptions): Promise<Record<string, unknown>> {
    const caseData = await this.requireCase(caseId);
    await this.projectService.assertProjectPermission(caseData.project_id, 'view', access);
    const interfaceData = await this.interfaceModel.findOne({ _id: caseData.interface_id }).lean();
    if (!interfaceData) {
      throw new NotFoundException('找不到对应的接口，请联系管理员');
    }
    const projectData = await this.projectModel.findOne({ _id: interfaceData.project_id }).lean();

    return {
      ...caseData,
      path: `${projectData?.basepath || ''}${interfaceData.path || ''}`,
      method: interfaceData.method || '',
      req_body_type: interfaceData.req_body_type || '',
      req_headers: this.mergeParams(interfaceData.req_headers, caseData.req_headers),
      res_body: interfaceData.res_body || '',
      res_body_type: interfaceData.res_body_type || '',
      req_body_form: this.mergeParams(interfaceData.req_body_form, caseData.req_body_form),
      req_query: this.mergeParams(interfaceData.req_query, caseData.req_query),
      req_params: this.mergeParams(interfaceData.req_params, caseData.req_params),
      interface_up_time: interfaceData.up_time || 0,
      req_body_is_json_schema: Boolean(interfaceData.req_body_is_json_schema),
      res_body_is_json_schema: Boolean(interfaceData.res_body_is_json_schema)
    };
  }

  async upCol(
    colId: number,
    payload: Record<string, unknown>,
    access: AccessOptions
  ): Promise<Record<string, unknown>> {
    const colData = await this.requireCol(colId);
    await this.projectService.assertProjectPermission(colData.project_id, 'edit', access);
    const updates: Record<string, unknown> = { ...payload };
    delete updates.col_id;
    delete updates.id;
    delete updates._id;
    updates.up_time = this.now();
    const result = await this.colModel.updateOne({ _id: colId }, { $set: updates });
    return {
      acknowledged: result.acknowledged,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount
    };
  }

  async upCaseIndex(list: Array<{ id?: string; index?: number }>): Promise<void> {
    await Promise.all(
      list
        .filter(item => item.id)
        .map(item =>
          this.caseModel.updateOne(
            { _id: item.id },
            {
              $set: {
                index: Number.isFinite(item.index) ? Number(item.index) : 0
              }
            }
          )
        )
    );
  }

  async upColIndex(list: Array<{ id?: number; index?: number }>): Promise<void> {
    await Promise.all(
      list
        .filter(item => Number.isFinite(item.id))
        .map(item =>
          this.colModel.updateOne(
            { _id: Number(item.id) },
            {
              $set: {
                index: Number.isFinite(item.index) ? Number(item.index) : 0
              }
            }
          )
        )
    );
  }

  async delCol(colId: number, access: AccessOptions): Promise<Record<string, unknown>> {
    const colData = await this.requireCol(colId);
    if (Number(colData.uid) !== Number(access.user?._id || 0)) {
      await this.projectService.assertProjectPermission(colData.project_id, 'danger', access);
    }
    const [colResult, caseResult] = await Promise.all([
      this.colModel.deleteOne({ _id: colId }),
      this.caseModel.deleteMany({ col_id: colId })
    ]);
    return {
      acknowledged: colResult.acknowledged && caseResult.acknowledged,
      deleted: {
        col: colResult.deletedCount || 0,
        case: caseResult.deletedCount || 0
      }
    };
  }

  async delCase(caseId: string, access: AccessOptions): Promise<Record<string, unknown>> {
    const caseData = await this.requireCase(caseId);
    if (Number(caseData.uid) !== Number(access.user?._id || 0)) {
      await this.projectService.assertProjectPermission(caseData.project_id, 'danger', access);
    }
    const result = await this.caseModel.deleteOne({ _id: caseData._id });
    await this.touchProject(caseData.project_id);
    return {
      acknowledged: result.acknowledged,
      deletedCount: result.deletedCount || 0
    };
  }

  async runCaseScript(
    payload: Record<string, unknown>,
    access: AccessOptions
  ): Promise<ApiResponse<Record<string, unknown>>> {
    const colId = Number(payload.col_id);
    if (!Number.isFinite(colId) || colId <= 0) {
      return resReturn({}, 400, 'col_id不能为空');
    }
    const colData = await this.requireCol(colId);
    await this.projectService.assertProjectPermission(colData.project_id, 'view', access);

    const logs: string[] = [];
    let result: Record<string, unknown> = {};
    try {
      const response = this.toObject(payload.response);
      const responseBody = this.parseResponseBody(response.body);
      const responseHeader = this.toObject(response.header);
      const responseStatus = response.status;

      const context: Record<string, unknown> = {
        assert: require('assert'),
        status: responseStatus,
        body: responseBody,
        header: responseHeader,
        records: this.toObject(payload.records),
        params: this.toObject(payload.params),
        log: (msg: unknown) => {
          logs.push(`log: ${this.convertString(msg)}`);
        }
      };

      if (Boolean(colData.checkHttpCodeIs200)) {
        const status = Number(responseStatus);
        if (status !== 200) {
          throw new Error('Http status code 不是 200，请检查(该规则来源于于 [测试集->通用规则配置] )');
        }
      }

      if (this.isRuleEnabled(colData.checkResponseField)) {
        const rule = this.toObject(colData.checkResponseField);
        const fieldName = this.toOptionalString(rule.name) || 'code';
        const expectedValue = rule.value;
        const actualValue =
          responseBody && typeof responseBody === 'object'
            ? (responseBody as Record<string, unknown>)[fieldName]
            : undefined;
        // Legacy behavior uses loose inequality.
        if ((actualValue as unknown) != (expectedValue as unknown)) {
          throw new Error(
            `返回json ${fieldName} 值不是${String(expectedValue)},请检查(该规则来源于于 [测试集->通用规则配置] )`
          );
        }
      }

      if (Boolean(colData.checkResponseSchema)) {
        const interfaceId = Number(payload.interface_id);
        if (!Number.isFinite(interfaceId) || interfaceId <= 0) {
          throw new Error('interface_id不能为空');
        }
        const interfaceData = await this.interfaceModel.findOne({ _id: interfaceId }).lean();
        if (!interfaceData) {
          throw new Error('不存在的接口');
        }
        if (interfaceData.res_body_is_json_schema && interfaceData.res_body) {
          const schema = this.parseJson(interfaceData.res_body);
          const validated = this.validateSchema(schema, responseBody);
          if (!validated.valid) {
            throw new Error(
              `返回Json 不符合 response 定义的数据结构,原因: ${validated.message}\n数据结构如下：\n${JSON.stringify(
                schema,
                null,
                2
              )}`
            );
          }
        }
      }

      if (this.isRuleEnabled(colData.checkScript)) {
        const globalScript = this.toOptionalString(this.toObject(colData.checkScript).content);
        if (globalScript) {
          logs.push(`执行脚本：${globalScript}`);
          result = await this.executeScript(context, globalScript);
        }
      }

      const script = this.toOptionalString(payload.script);
      if (script) {
        logs.push(`执行脚本:${script}`);
        result = await this.executeScript(context, script);
      }
      result.logs = logs;
      return resReturn(result);
    } catch (err) {
      logs.push(this.convertString(err));
      result.logs = logs;
      return resReturn(result, 400, this.formatScriptError(err));
    }
  }

  private mergeParams(baseInput: unknown, caseInput: unknown): Array<Record<string, unknown>> {
    const base = Array.isArray(baseInput) ? (baseInput as Array<Record<string, unknown>>) : [];
    const current = Array.isArray(caseInput) ? (caseInput as Array<Record<string, unknown>>) : [];
    const currentMap = new Map<string, Record<string, unknown>>();
    current.forEach(item => {
      const name = this.toOptionalString(item.name);
      if (name) {
        currentMap.set(name, item);
      }
    });
    const merged = base.map(item => {
      const name = this.toOptionalString(item.name);
      if (!name) return item;
      const target = currentMap.get(name);
      if (!target) return item;
      return {
        ...item,
        ...target
      };
    });
    const mergedNames = new Set(
      merged
        .map(item => this.toOptionalString(item.name))
        .filter((item): item is string => Boolean(item))
    );
    for (const item of current) {
      const name = this.toOptionalString(item.name);
      if (name && !mergedNames.has(name)) {
        merged.push(item);
      }
    }
    return merged;
  }

  private async executeScript(
    context: Record<string, unknown>,
    script: string
  ): Promise<Record<string, unknown>> {
    const vm = await import('node:vm');
    const sandbox = { ...context };
    const wrapped = `(async function(){\n${script}\n; return this; }).call(this)`;
    const result = vm.runInNewContext(wrapped, sandbox, { timeout: 3000 });
    const resolved = await this.awaitWithTimeout(result, 60000);
    if (resolved && typeof resolved === 'object') {
      return resolved as Record<string, unknown>;
    }
    return sandbox;
  }

  private async awaitWithTimeout<T>(value: T | Promise<T>, timeoutMs: number): Promise<T> {
    if (!value || typeof (value as { then?: unknown }).then !== 'function') {
      return value as T;
    }
    return await new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`脚本执行超时(${timeoutMs}ms)`));
      }, timeoutMs);
      (value as Promise<T>)
        .then(output => {
          clearTimeout(timer);
          resolve(output);
        })
        .catch(err => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  private validateSchema(schema: unknown, params: unknown): { valid: boolean; message: string } {
    try {
      const Ajv = require('ajv');
      const ajv = new Ajv({
        format: false,
        meta: false
      });
      try {
        const draft4 = require('ajv/lib/refs/json-schema-draft-04.json');
        ajv.addMetaSchema(draft4);
        // Keep behavior aligned with legacy validator when draft-04 schema is available.
        ajv._opts.defaultMeta = draft4.id;
        ajv._refs['http://json-schema.org/schema'] = 'http://json-schema.org/draft-04/schema';
      } catch (_err) {
        // Some runtimes only ship newer Ajv bundles without this file.
      }

      const actualSchema =
        schema && typeof schema === 'object'
          ? schema
          : {
              type: 'object',
              title: 'empty object',
              properties: {}
            };
      const validate = ajv.compile(actualSchema);
      const valid = validate(params);
      if (valid) {
        return { valid: true, message: '' };
      }
      try {
        const ajvI18n = require('ajv-i18n');
        ajvI18n.zh(validate.errors);
      } catch (_err) {
        // i18n package is optional in the new runtime.
      }
      return {
        valid: false,
        message: ajv.errorsText(validate.errors, { separator: '\n' })
      };
    } catch (err) {
      return {
        valid: false,
        message: err instanceof Error ? err.message : String(err)
      };
    }
  }

  private parseResponseBody(input: unknown): unknown {
    if (typeof input !== 'string') {
      return input;
    }
    const raw = input.trim();
    if (!raw) return raw;
    try {
      return JSON.parse(raw);
    } catch (_err) {
      return raw;
    }
  }

  private parseJson(input: unknown): unknown {
    if (typeof input !== 'string') {
      return input;
    }
    try {
      return JSON.parse(input);
    } catch (_err) {
      return {};
    }
  }

  private isRuleEnabled(input: unknown): boolean {
    const value = this.toObject(input);
    return Boolean(value.enable);
  }

  private toObject(input: unknown): Record<string, unknown> {
    if (input && typeof input === 'object' && !Array.isArray(input)) {
      return input as Record<string, unknown>;
    }
    return {};
  }

  private convertString(variable: unknown): string {
    if (variable instanceof Error) {
      return `${variable.name}: ${variable.message}`;
    }
    try {
      if (typeof variable === 'string') {
        return variable;
      }
      return JSON.stringify(variable, null, 2);
    } catch (_err) {
      return String(variable || '');
    }
  }

  private formatScriptError(err: unknown): string {
    if (err instanceof Error) {
      return `${err.name}: ${err.message}`;
    }
    return `Error: ${String(err)}`;
  }

  private paramsToObject(input: unknown): Record<string, unknown> {
    if (!Array.isArray(input)) return {};
    const result: Record<string, unknown> = {};
    for (const item of input) {
      if (!item || typeof item !== 'object') continue;
      const name = this.toOptionalString((item as Record<string, unknown>).name);
      if (!name) continue;
      const value = (item as Record<string, unknown>).value;
      result[name] = typeof value === 'undefined' ? '' : value;
    }
    return result;
  }

  private parseJsonObject(input: unknown): Record<string, unknown> {
    if (input && typeof input === 'object' && !Array.isArray(input)) {
      return input as Record<string, unknown>;
    }
    if (typeof input !== 'string' || !input.trim()) {
      return {};
    }
    try {
      const parsed = JSON.parse(input);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return {};
    } catch (_err) {
      return {};
    }
  }

  private async requireCol(id: number): Promise<InterfaceColEntity> {
    const row = await this.colModel.findOne({ _id: id }).lean();
    if (!row) {
      throw new NotFoundException('不存在');
    }
    return row;
  }

  private async requireCase(id: string): Promise<InterfaceCaseEntity & { _id: unknown }> {
    const row = await this.caseModel.findOne({ _id: id }).lean();
    if (!row) {
      throw new NotFoundException('不存在的case');
    }
    return row as InterfaceCaseEntity & { _id: unknown };
  }

  private async requireInterface(id: number): Promise<InterfaceEntity> {
    const row = await this.interfaceModel.findOne({ _id: id }).lean();
    if (!row) {
      throw new NotFoundException('不存在的接口');
    }
    return row;
  }

  private actorUid(user: SessionUser | null | undefined): number {
    return user?._id || 0;
  }

  private async touchProject(projectId: number): Promise<void> {
    await this.projectModel.updateOne(
      { _id: projectId },
      {
        $set: {
          up_time: this.now()
        }
      }
    );
  }

  private toOptionalString(input: unknown): string | undefined {
    if (typeof input !== 'string') return undefined;
    const trimmed = input.trim();
    return trimmed ? trimmed : undefined;
  }

  private now(): number {
    return Math.floor(Date.now() / 1000);
  }
}
