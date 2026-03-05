import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import axios from 'axios';
import { FastifyReply } from 'fastify';
import { Model } from 'mongoose';
import https from 'node:https';
import type { SpecImportResult, SpecSource, SyncMode } from '@yapi-next/shared-types';
import { resReturn } from './common/api-response';
import { mapError } from './common/error-response';
import {
  hasHttpPrefix,
  InputMap,
  pickBoolean,
  pickJson,
  pickNumber,
  pickString
} from './common/request-utils';
import { InterfaceCaseEntity } from './database/schemas/interface-case.schema';
import { InterfaceCatEntity } from './database/schemas/interface-cat.schema';
import { InterfaceEntity } from './database/schemas/interface.schema';
import { InterfaceColEntity } from './database/schemas/interface-col.schema';
import { ProjectEntity } from './database/schemas/project.schema';
import { ColCompatService } from './services/col-compat.service';
import { ProjectAuthService } from './services/project-auth.service';
import { SpecService } from './services/spec.service';
import { renderReportHtml } from './legacy/report-html';

type LegacyParam = Record<string, unknown> & {
  name?: string;
  value?: unknown;
  enable?: boolean;
  required?: string | number | boolean;
};

type LegacyEnv = {
  name?: string;
  domain?: string;
  header?: LegacyParam[];
  global?: LegacyParam[];
};

type LegacyCase = InterfaceCaseEntity & {
  _id: unknown;
  case_env?: string;
  test_script?: string;
  req_headers?: LegacyParam[];
  req_query?: LegacyParam[];
  req_params?: LegacyParam[];
  req_body_form?: LegacyParam[];
  req_body_type?: string;
  req_body_other?: string;
};

type LegacyProject = ProjectEntity & {
  pre_script?: string;
  after_script?: string;
};

type LegacyInterface = InterfaceEntity;

type AutoTestResultItem = {
  id: string;
  name: string;
  path: string;
  code: number;
  validRes: Array<{ message: string }>;
  status?: number | null;
  statusText?: string;
  url?: string;
  method?: string;
  data?: unknown;
  headers?: unknown;
  res_header?: unknown;
  res_body?: unknown;
  params?: Record<string, unknown>;
};

type AutoTestReport = {
  message: {
    msg: string;
    len: number;
    successNum: number;
    failedNum: number;
  };
  runTime: string;
  numbs: number;
  list: AutoTestResultItem[];
};

@Controller('open')
export class OpenCompatController {
  constructor(
    private readonly specService: SpecService,
    private readonly projectAuthService: ProjectAuthService,
    private readonly colService: ColCompatService,
    @InjectModel(InterfaceCaseEntity.name)
    private readonly interfaceCaseModel: Model<InterfaceCaseEntity>,
    @InjectModel(InterfaceCatEntity.name)
    private readonly interfaceCatModel: Model<InterfaceCatEntity>,
    @InjectModel(InterfaceEntity.name)
    private readonly interfaceModel: Model<InterfaceEntity>,
    @InjectModel(ProjectEntity.name)
    private readonly projectModel: Model<ProjectEntity>,
    @InjectModel(InterfaceColEntity.name)
    private readonly interfaceColModel: Model<InterfaceColEntity>
  ) {}

  @Post('import_data')
  async importData(@Body() body: InputMap) {
    try {
      const importType = pickString(body.type);
      if (importType !== 'swagger') {
        return resReturn(null, 40022, '不存在的导入方式');
      }

      const token = pickString(body.token);
      const projectId = await this.projectAuthService.resolveProjectId(
        pickNumber(body.project_id),
        token
      );
      await this.projectAuthService.assertProjectEditable(projectId, token);

      const legacyDataSync = pickString(body.dataSync);
      const merge = pickString(body.merge) || legacyDataSync;
      const syncMode = this.normalizeSyncMode(merge, 'normal');
      const warnMessage = legacyDataSync && !pickString(body.merge)
        ? 'importData Api 已废弃 dataSync 传参，请联系管理员将 dataSync 改为 merge.'
        : '';

      const urlValue = pickString(body.url);
      const jsonValue = pickJson(body.json);
      const useUrl = !!urlValue || hasHttpPrefix(jsonValue);
      const source: SpecSource = useUrl ? 'url' : 'json';

      const result = await this.specService.import({
        projectId,
        source,
        format: 'auto',
        json: source === 'json' ? jsonValue : undefined,
        url: source === 'url' ? (urlValue || jsonValue) : undefined,
        syncMode
      });

      const message = this.buildSuccessMessage(result, warnMessage);
      return resReturn(null, 0, message);
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(null, mapped.errcode, mapped.errmsg);
    }
  }

  @Get('project_interface_data')
  async projectInterfaceData(@Query() query: InputMap) {
    try {
      const token = pickString(query.token);
      const projectId = await this.projectAuthService.resolveProjectId(
        pickNumber(query.project_id),
        token
      );
      await this.projectAuthService.assertProjectReadable(projectId, token);

      const [project, cats, interfaces] = await Promise.all([
        this.projectModel
          .findOne({ _id: projectId })
          .select('_id name basepath desc group_id project_type env tag')
          .lean(),
        this.interfaceCatModel
          .find({ project_id: projectId })
          .sort({ index: 1, _id: 1 })
          .lean(),
        this.interfaceModel
          .find({ project_id: projectId })
          .sort({ catid: 1, index: 1, _id: 1 })
          .select('_id catid title path method status tag up_time')
          .lean()
      ]);

      const catCountMap = new Map<number, number>();
      interfaces.forEach(item => {
        const catid = Number(item.catid) || 0;
        catCountMap.set(catid, Number(catCountMap.get(catid) || 0) + 1);
      });

      return resReturn({
        project: project || null,
        stats: {
          categories: cats.length,
          interfaces: interfaces.length
        },
        categories: cats.map(item => ({
          _id: item._id,
          name: item.name,
          desc: item.desc,
          index: item.index,
          interface_count: Number(catCountMap.get(Number(item._id)) || 0)
        })),
        interfaces
      });
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(null, mapped.errcode, mapped.errmsg);
    }
  }

  @Get('plugin/export-full')
  async exportPluginFull(
    @Query() query: InputMap,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    try {
      const token = pickString(query.token);
      const projectId = await this.projectAuthService.resolveProjectId(
        pickNumber(query.pid) || pickNumber(query.project_id),
        token
      );
      await this.projectAuthService.assertProjectReadable(projectId, token);

      const type = pickString(query.type) || 'json';
      if (type !== 'json') {
        return resReturn(null, 400, '仅支持 type=json');
      }
      const status = pickString(query.status) === 'open' ? 'open' : 'all';
      const payload = await this.buildLegacyExportFullData(projectId, status);

      reply.header('Content-Type', 'application/octet-stream');
      reply.header('Content-Disposition', 'attachment; filename=api.json');
      return JSON.stringify(payload, null, 2);
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(null, mapped.errcode, mapped.errmsg);
    }
  }

  @Get('run_auto_test')
  async runAutoTest(
    @Query() query: InputMap,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    try {
      const token = pickString(query.token);
      if (!token) {
        return resReturn(null, 40022, 'token 验证失败');
      }

      const colId = pickNumber(query.id);
      if (!colId) {
        return resReturn(null, 40022, 'id值不存在');
      }
      const col = await this.interfaceColModel.findOne({ _id: colId }).lean();
      if (!col) {
        return resReturn(null, 40022, 'id值不存在');
      }

      const queryProjectId = pickNumber(query.project_id);
      const projectId = queryProjectId || Number(col.project_id);
      await this.projectAuthService.resolveProjectId(projectId, token);
      await this.projectAuthService.assertProjectReadable(projectId, token);

      const mode = pickString(query.mode) === 'json' ? 'json' : 'html';
      const report = await this.buildAutoTestReport(colId, projectId, token, query);

      if (pickBoolean(query.download)) {
        reply.header('Content-Disposition', `attachment; filename=test.${mode}`);
      }
      if (mode === 'json') {
        return report;
      }
      reply.header('Content-Type', 'text/html; charset=utf-8');
      return renderReportHtml(report);
    } catch (err) {
      const mapped = mapError(err);
      if (
        mapped.errmsg.includes('token') ||
        mapped.errmsg.includes('project_id') ||
        mapped.errmsg.includes('私有项目必须传 token')
      ) {
        return resReturn(null, 40022, mapped.errmsg);
      }
      if (mapped.errcode === 404) {
        return resReturn(null, 40022, mapped.errmsg);
      }
      return resReturn(null, mapped.errcode, mapped.errmsg);
    }
  }

  private normalizeSyncMode(
    value: string | undefined,
    fallback: SyncMode
  ): SyncMode {
    const input = (value || '').toLowerCase();
    if (input === 'good' || input === 'merge') return input;
    if (input === 'normal') return 'normal';
    return fallback;
  }

  private buildSuccessMessage(result: SpecImportResult, warnMessage: string): string {
    const created = Number(result.created || 0);
    const updated = Number(result.updated || 0);
    const skipped = Number(result.skipped || 0);
    const failed = Number(result.failed || 0);
    const base = `导入成功，新增 ${created}，更新 ${updated}，跳过 ${skipped}，失败 ${failed}`;
    return warnMessage ? `${base}。${warnMessage}` : base;
  }

  private async buildAutoTestReport(
    colId: number,
    projectId: number,
    token: string,
    query: InputMap
  ): Promise<AutoTestReport> {
    const startedAt = Date.now();
    const records: Record<string, unknown> = {};
    const selectedEnvMap = this.pickEnvSelection(query);
    const caseRows = (await this.interfaceCaseModel
      .find({ col_id: colId })
      .sort({ index: 1, _id: 1 })
      .lean()) as LegacyCase[];

    const interfaceIds = Array.from(
      new Set(caseRows.map(item => Number(item.interface_id)).filter(item => Number.isFinite(item) && item > 0))
    );
    const interfaceRows =
      interfaceIds.length > 0
        ? ((await this.interfaceModel
            .find({ _id: { $in: interfaceIds } })
            .lean()) as LegacyInterface[])
        : [];
    const interfaceMap = new Map<number, LegacyInterface>();
    interfaceRows.forEach(item => interfaceMap.set(Number(item._id), item));

    const projectIds = Array.from(
      new Set(
        caseRows
          .map(item => Number(item.project_id))
          .concat([projectId])
          .filter(item => Number.isFinite(item) && item > 0)
      )
    );
    const projectRows =
      projectIds.length > 0
        ? ((await this.projectModel
            .find({ _id: { $in: projectIds } })
            .select('_id env pre_script after_script basepath')
            .lean()) as LegacyProject[])
        : [];
    const projectMap = new Map<number, LegacyProject>();
    projectRows.forEach(item => projectMap.set(Number(item._id), item));

    const list: AutoTestResultItem[] = [];
    for (const caseRow of caseRows) {
      const caseId = this.stringifyId(caseRow._id);
      const interfaceId = Number(caseRow.interface_id);
      const interfaceData = interfaceMap.get(interfaceId);
      if (!interfaceData) {
        list.push({
          id: caseId,
          name: this.toOptionalString(caseRow.casename) || `case-${caseId}`,
          path: '',
          code: 400,
          validRes: [{ message: `接口 ${interfaceId} 不存在，已跳过` }]
        });
        continue;
      }
      const caseProjectId = Number(caseRow.project_id) || projectId;
      const projectData = projectMap.get(caseProjectId);
      if (!projectData) {
        list.push({
          id: caseId,
          name: this.toOptionalString(caseRow.casename) || `case-${caseId}`,
          path: this.toOptionalString(interfaceData.path) || '',
          code: 400,
          validRes: [{ message: `项目 ${caseProjectId} 不存在，已跳过` }]
        });
        continue;
      }
      const selectedEnv = selectedEnvMap.get(caseProjectId);
      const runCase = this.buildRunCaseData(caseRow, interfaceData, projectData, selectedEnv);
      const result = await this.runAutoTestCase(runCase, records, token);
      records[caseId] = {
        params: result.params || {},
        body: result.res_body
      };
      list.push(result);
    }

    const message = this.buildAutoTestMessage(list);
    return {
      message,
      runTime: `${(Date.now() - startedAt) / 1000}s`,
      numbs: list.length,
      list
    };
  }

  private async runAutoTestCase(
    caseData: Record<string, unknown>,
    records: Record<string, unknown>,
    token: string
  ): Promise<AutoTestResultItem> {
    const requestParams: Record<string, unknown> = {};
    const caseId = this.stringifyId(caseData._id || caseData.id);
    const result: AutoTestResultItem = {
      id: caseId,
      name: this.toOptionalString(caseData.casename) || `case-${caseId}`,
      path: this.toOptionalString(caseData.path) || '',
      code: 400,
      validRes: []
    };

    try {
      const requestResult = await this.executeCaseHttpRequest(caseData, requestParams, records);
      const responseData = requestResult.res;
      const requestData = requestResult.req;

      result.status = typeof responseData.status === 'number' ? responseData.status : null;
      result.statusText = this.toOptionalString(responseData.statusText) || '';
      result.url = this.toOptionalString(requestData.url) || '';
      result.method = (this.toOptionalString(requestData.method) || '').toUpperCase();
      result.data = requestData.data;
      result.headers = requestData.headers;
      result.res_header = responseData.header;
      result.res_body = responseData.body;
      result.params = requestParams;

      const scriptCheck = await this.colService.runCaseScript(
        {
          col_id: this.toNumber(caseData.col_id) || 0,
          interface_id: this.toNumber(caseData.interface_id) || 0,
          response: {
            status: responseData.status,
            body: responseData.body,
            header: responseData.header,
            statusText: responseData.statusText
          },
          records,
          params: requestParams,
          script: this.toOptionalString(caseData.test_script) || ''
        },
        { token }
      );
      if (scriptCheck.errcode === 0) {
        result.code = 0;
        result.validRes = [{ message: '验证通过' }];
      } else {
        result.code = 1;
        const messages = this.extractScriptMessages(scriptCheck.data);
        result.validRes =
          messages.length > 0 ? messages.map(message => ({ message })) : [{ message: scriptCheck.errmsg }];
      }
      return result;
    } catch (err) {
      const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      result.status = null;
      result.statusText = message;
      result.res_body = message;
      result.code = 400;
      result.validRes = [{ message }];
      return result;
    }
  }

  private async executeCaseHttpRequest(
    caseData: Record<string, unknown>,
    requestParams: Record<string, unknown>,
    _records: Record<string, unknown>
  ): Promise<{
    req: {
      url: string;
      method: string;
      headers: Record<string, unknown>;
      data: unknown;
    };
    res: {
      status: number | null;
      statusText: string;
      header: unknown;
      body: unknown;
    };
  }> {
    const env = this.pickCurrentEnv(
      this.normalizeProjectEnv(caseData.env),
      this.toOptionalString(caseData.case_env) || ''
    );
    const domain = this.toOptionalString(env.domain);
    if (!domain) {
      throw new Error('项目环境缺少 domain，无法执行自动化测试');
    }

    const path = this.applyPathParams(
      this.toOptionalString(caseData.path) || '/',
      caseData.req_params,
      requestParams
    );
    const query = this.paramsToObject(caseData.req_query, true, requestParams);
    const headers = this.normalizeHeaders(this.paramsToObject(caseData.req_headers, false, requestParams));
    const body = this.buildRequestBody(caseData, requestParams);
    const method = (this.toOptionalString(caseData.method) || 'GET').toLowerCase();
    const url = this.buildRequestUrl(domain, path, query);
    const req = {
      url,
      method,
      headers,
      data: body
    };

    try {
      const response = await axios.request({
        method,
        url,
        headers,
        data: body,
        timeout: 10000,
        maxRedirects: 0,
        httpsAgent: new https.Agent({
          rejectUnauthorized: false
        }),
        validateStatus: () => true
      });
      return {
        req,
        res: {
          status: response.status,
          statusText: response.statusText || '',
          header: response.headers || {},
          body: response.data
        }
      };
    } catch (err) {
      const error = err as {
        response?: {
          status?: number;
          statusText?: string;
          headers?: unknown;
          data?: unknown;
        };
        message?: string;
      };
      if (error.response) {
        return {
          req,
          res: {
            status: typeof error.response.status === 'number' ? error.response.status : null,
            statusText: error.response.statusText || '',
            header: error.response.headers || {},
            body: error.response.data
          }
        };
      }
      return {
        req,
        res: {
          status: null,
          statusText: error.message || '请求异常',
          header: {},
          body: error.message || '请求异常'
        }
      };
    }
  }

  private buildRunCaseData(
    caseData: LegacyCase,
    interfaceData: LegacyInterface,
    projectData: LegacyProject,
    selectedEnv: string | undefined
  ): Record<string, unknown> {
    const env = this.normalizeProjectEnv(projectData.env);
    const caseEnv = selectedEnv || this.toOptionalString(caseData.case_env) || '';
    const reqHeaders = this.mergeParams(interfaceData.req_headers, caseData.req_headers);
    const reqQuery = this.mergeParams(interfaceData.req_query, caseData.req_query);
    const reqParams = this.mergeParams(interfaceData.req_params, caseData.req_params);
    const reqBodyForm = this.mergeParams(interfaceData.req_body_form, caseData.req_body_form);
    return {
      _id: this.stringifyId(caseData._id),
      id: this.stringifyId(caseData._id),
      col_id: this.toNumber(caseData.col_id) || 0,
      interface_id: this.toNumber(interfaceData._id) || 0,
      project_id: this.toNumber(caseData.project_id) || this.toNumber(projectData._id) || 0,
      casename: this.toOptionalString(caseData.casename) || `case-${this.stringifyId(caseData._id)}`,
      path: `${this.toOptionalString(projectData.basepath) || ''}${this.toOptionalString(interfaceData.path) || ''}`,
      method: this.toOptionalString(interfaceData.method) || 'GET',
      req_headers: this.appendEnvHeaders(reqHeaders, env, caseEnv),
      req_query: reqQuery,
      req_params: reqParams,
      req_body_form: reqBodyForm,
      req_body_type:
        this.toOptionalString(caseData.req_body_type) || this.toOptionalString(interfaceData.req_body_type) || 'raw',
      req_body_other: this.pickBodyOther(caseData.req_body_other, interfaceData.req_body_other),
      test_script: this.toOptionalString(caseData.test_script) || '',
      case_env: caseEnv,
      env,
      pre_script: this.toOptionalString(projectData.pre_script) || '',
      after_script: this.toOptionalString(projectData.after_script) || ''
    };
  }

  private pickEnvSelection(query: InputMap): Map<number, string> {
    const map = new Map<number, string>();
    Object.entries(query).forEach(([key, value]) => {
      if (!key.startsWith('env_')) return;
      const projectId = Number(key.slice(4));
      const envName = pickString(value);
      if (Number.isFinite(projectId) && projectId > 0 && envName) {
        map.set(projectId, envName);
      }
    });
    return map;
  }

  private buildAutoTestMessage(list: AutoTestResultItem[]): {
    msg: string;
    len: number;
    successNum: number;
    failedNum: number;
  } {
    let successNum = 0;
    let failedNum = 0;
    list.forEach(item => {
      if (item.code === 0) {
        successNum += 1;
      } else {
        failedNum += 1;
      }
    });
    const len = list.length;
    if (failedNum === 0) {
      return {
        msg: `一共 ${len} 测试用例，全部验证通过`,
        len,
        successNum,
        failedNum
      };
    }
    return {
      msg: `一共 ${len} 测试用例，${successNum} 个验证通过， ${failedNum} 个未通过。`,
      len,
      successNum,
      failedNum
    };
  }

  private extractScriptMessages(data: unknown): string[] {
    if (!data || typeof data !== 'object') return [];
    const logs = (data as Record<string, unknown>).logs;
    if (!Array.isArray(logs)) return [];
    return logs.map(item => this.stringValue(item)).filter(Boolean);
  }

  private async buildLegacyExportFullData(
    projectId: number,
    status: 'all' | 'open'
  ): Promise<Array<Record<string, unknown>>> {
    const project = await this.projectModel.findOne({ _id: projectId }).lean();
    if (!project) {
      throw new Error('项目不存在');
    }
    const filter: Record<string, unknown> = { project_id: projectId };
    if (status === 'open') {
      filter.api_opened = true;
    }
    const [cats, interfaces] = await Promise.all([
      this.interfaceCatModel.find({ project_id: projectId }).sort({ index: 1, _id: 1 }).lean(),
      this.interfaceModel.find(filter).sort({ catid: 1, index: 1, _id: 1 }).lean()
    ]);

    const apiBucket = new Map<number, Array<Record<string, unknown>>>();
    interfaces.forEach(item => {
      const catid = Number(item.catid || 0);
      if (!apiBucket.has(catid)) {
        apiBucket.set(catid, []);
      }
      apiBucket.get(catid)!.push(JSON.parse(JSON.stringify(item)) as Record<string, unknown>);
    });

    const basepath = String(project.basepath || '').trim();
    const mergePath = (left: string, right: string): string => {
      const next = `${left || ''}/${right || ''}`.replace(/\/{2,}/g, '/');
      return next.startsWith('/') ? next : `/${next}`;
    };
    const stripIds = (row: Record<string, unknown>) => {
      delete row._id;
      delete row.__v;
      delete row.uid;
      delete row.edit_uid;
      delete row.project_id;
      delete row.catid;
    };

    const out: Array<Record<string, unknown>> = [];
    cats.forEach(cat => {
      const catid = Number(cat._id || 0);
      const catApis = apiBucket.get(catid) || [];
      if (catApis.length === 0) return;
      const catRow = JSON.parse(JSON.stringify(cat)) as Record<string, unknown>;
      stripIds(catRow);
      catRow.proBasepath = basepath;
      catRow.proName = project.name;
      catRow.proDescription = project.desc || '';
      catRow.list = catApis.map(api => {
        const item = JSON.parse(JSON.stringify(api)) as Record<string, unknown>;
        stripIds(item);
        if (Array.isArray(item.req_body_form)) {
          (item.req_body_form as Array<Record<string, unknown>>).forEach(stripIds);
        }
        if (Array.isArray(item.req_params)) {
          (item.req_params as Array<Record<string, unknown>>).forEach(stripIds);
        }
        if (Array.isArray(item.req_query)) {
          (item.req_query as Array<Record<string, unknown>>).forEach(stripIds);
        }
        if (Array.isArray(item.req_headers)) {
          (item.req_headers as Array<Record<string, unknown>>).forEach(stripIds);
        }
        if (basepath) {
          const full = mergePath(basepath, String(item.path || ''));
          item.path = full;
          if (item.query_path && typeof item.query_path === 'object') {
            (item.query_path as Record<string, unknown>).path = full;
          }
        }
        return item;
      });
      out.push(catRow);
    });

    return out;
  }

  private normalizeProjectEnv(input: unknown): LegacyEnv[] {
    if (!Array.isArray(input)) {
      return [{ name: 'default', domain: '', header: [], global: [] }];
    }
    const env = input
      .filter(item => item && typeof item === 'object')
      .map(item => {
        const envData = item as Record<string, unknown>;
        return {
          name: this.toOptionalString(envData.name) || 'default',
          domain: this.toOptionalString(envData.domain) || '',
          header: this.toParamArray(envData.header),
          global: this.toParamArray(envData.global)
        };
      });
    if (env.length === 0) {
      env.push({ name: 'default', domain: '', header: [], global: [] });
    }
    return env;
  }

  private appendEnvHeaders(headers: LegacyParam[], envList: LegacyEnv[], caseEnv: string): LegacyParam[] {
    const output = headers.map(item => ({ ...item }));
    const current = this.pickCurrentEnv(envList, caseEnv);
    const envHeaders = this.toParamArray(current.header);
    envHeaders.forEach(item => {
      const name = this.toOptionalString(item.name);
      if (!name) return;
      if (this.hasParamName(name, output)) {
        return;
      }
      output.push({
        ...item,
        enable: true
      });
    });
    return output;
  }

  private hasParamName(name: string, params: LegacyParam[]): boolean {
    return params.some(item => this.toOptionalString(item.name) === name);
  }

  private mergeParams(baseInput: unknown, caseInput: unknown): LegacyParam[] {
    const base = this.toParamArray(baseInput);
    const current = this.toParamArray(caseInput);
    const currentMap = new Map<string, LegacyParam>();
    current.forEach(item => {
      const name = this.toOptionalString(item.name);
      if (name) {
        currentMap.set(name, item);
      }
    });

    const merged = base.map(item => {
      const name = this.toOptionalString(item.name);
      if (!name) return { ...item };
      const target = currentMap.get(name);
      if (!target) return { ...item };
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
    current.forEach(item => {
      const name = this.toOptionalString(item.name);
      if (!name || mergedNames.has(name)) {
        return;
      }
      merged.push({ ...item });
    });
    return merged;
  }

  private pickBodyOther(caseValue: unknown, interfaceValue: unknown): string {
    const caseBody = this.toOptionalString(caseValue);
    if (typeof caseBody === 'string') {
      return caseBody;
    }
    const interfaceBody = this.toOptionalString(interfaceValue);
    return interfaceBody || '';
  }

  private toParamArray(input: unknown): LegacyParam[] {
    if (!Array.isArray(input)) return [];
    return input.filter(item => item && typeof item === 'object') as LegacyParam[];
  }

  private toOptionalString(input: unknown): string | undefined {
    if (typeof input !== 'string') return undefined;
    const value = input.trim();
    return value ? value : undefined;
  }

  private stringifyId(input: unknown): string {
    if (typeof input === 'string') return input;
    if (typeof input === 'number' && Number.isFinite(input)) return String(input);
    if (input && typeof input === 'object' && typeof (input as { toString?: unknown }).toString === 'function') {
      return (input as { toString: () => string }).toString();
    }
    return '';
  }

  private stringValue(input: unknown): string {
    if (typeof input === 'string') return input;
    if (input instanceof Error) return `${input.name}: ${input.message}`;
    try {
      return JSON.stringify(input, null, 2);
    } catch (_err) {
      return String(input || '');
    }
  }

  private toNumber(input: unknown): number | undefined {
    if (typeof input === 'number' && Number.isFinite(input)) {
      return input;
    }
    if (typeof input === 'string' && input.trim()) {
      const value = Number(input);
      if (Number.isFinite(value)) {
        return value;
      }
    }
    return undefined;
  }

  private pickCurrentEnv(envList: LegacyEnv[], caseEnv: string): LegacyEnv {
    const matched = envList.find(item => this.toOptionalString(item.name) === caseEnv);
    if (matched) {
      return matched;
    }
    if (envList[0]) {
      return {
        ...envList[0],
        header: this.toParamArray(envList[0].header),
        global: this.toParamArray(envList[0].global)
      };
    }
    return {
      name: 'default',
      domain: '',
      header: [],
      global: []
    };
  }

  private applyPathParams(
    path: string,
    paramsInput: unknown,
    requestParams: Record<string, unknown>
  ): string {
    let output = path;
    this.toParamArray(paramsInput).forEach(item => {
      const name = this.toOptionalString(item.name);
      if (!name) return;
      if (!this.shouldIncludeParam(item, true)) return;
      const value = this.valueToString(item.value);
      requestParams[name] = value;
      output = output.replace(`:${name}`, value || `:${name}`);
      output = output.replace(`{${name}}`, value || `{${name}}`);
    });
    return output;
  }

  private paramsToObject(
    input: unknown,
    strictEnable: boolean,
    requestParams: Record<string, unknown>
  ): Record<string, unknown> {
    const output: Record<string, unknown> = {};
    this.toParamArray(input).forEach(item => {
      const name = this.toOptionalString(item.name);
      if (!name) return;
      if (!this.shouldIncludeParam(item, strictEnable)) return;
      output[name] = item.value;
      requestParams[name] = item.value;
    });
    return output;
  }

  private shouldIncludeParam(input: LegacyParam, strictEnable: boolean): boolean {
    if (strictEnable) {
      if (input.enable === true) return true;
      if (input.enable === false) return false;
      return input.required === '1' || input.required === 1 || input.required === true;
    }
    return input.enable !== false;
  }

  private buildRequestBody(
    caseData: Record<string, unknown>,
    requestParams: Record<string, unknown>
  ): unknown {
    const bodyType = (this.toOptionalString(caseData.req_body_type) || 'raw').toLowerCase();
    if (bodyType === 'form') {
      const formData = this.paramsToObject(caseData.req_body_form, true, requestParams);
      return formData;
    }
    if (bodyType === 'json') {
      const raw = caseData.req_body_other;
      if (typeof raw === 'string') {
        if (!raw.trim()) return '';
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            Object.assign(requestParams, parsed as Record<string, unknown>);
          }
          return parsed;
        } catch (_err) {
          return raw;
        }
      }
      return raw;
    }
    return caseData.req_body_other || '';
  }

  private buildRequestUrl(
    domain: string,
    path: string,
    query: Record<string, unknown>
  ): string {
    const pathValue = path || '/';
    const url = /^https?:\/\//i.test(pathValue)
      ? new URL(pathValue)
      : new URL(pathValue.startsWith('/') ? pathValue : `/${pathValue}`, domain);
    Object.entries(query).forEach(([name, value]) => {
      if (typeof value === 'undefined' || value === null) return;
      url.searchParams.set(name, this.valueToString(value));
    });
    return url.toString();
  }

  private valueToString(input: unknown): string {
    if (typeof input === 'string') return input;
    if (typeof input === 'number' || typeof input === 'boolean') return String(input);
    if (input === null || typeof input === 'undefined') return '';
    try {
      return JSON.stringify(input);
    } catch (_err) {
      return String(input);
    }
  }

  private normalizeHeaders(input: Record<string, unknown>): Record<string, string> {
    const output: Record<string, string> = {};
    Object.entries(input).forEach(([name, value]) => {
      output[name] = this.valueToString(value);
    });
    return output;
  }
}
