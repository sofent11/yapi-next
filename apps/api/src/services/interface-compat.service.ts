import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { handleVarPath, normalizePath, verifyPath } from '../common/path-utils';
import { InterfaceCaseEntity } from '../database/schemas/interface-case.schema';
import { InterfaceCatEntity } from '../database/schemas/interface-cat.schema';
import { InterfaceEntity } from '../database/schemas/interface.schema';
import { GroupEntity } from '../database/schemas/group.schema';
import { ProjectEntity } from '../database/schemas/project.schema';
import { UserEntity } from '../database/schemas/user.schema';
import { CounterService } from './counter.service';
import { InterfaceTreeCacheService } from './interface-tree-cache.service';
import { ProjectCompatService } from './project-compat.service';
import { SessionUser } from './session-auth.service';

const mergeJsonSchema = require('../../../../common/mergeJsonSchema');

type AccessOptions = {
  user?: SessionUser | null;
  token?: string;
};

type ListFilter = {
  projectId: number;
  page?: number;
  limit?: number | 'all';
  status?: string | string[];
  tag?: string | string[];
  token?: string;
  user?: SessionUser | null;
};

type CatListFilter = {
  catid: number;
  page?: number;
  limit?: number;
  status?: string | string[];
  tag?: string | string[];
  token?: string;
  user?: SessionUser | null;
};

@Injectable()
export class InterfaceCompatService {
  constructor(
    @InjectModel(InterfaceEntity.name)
    private readonly interfaceModel: Model<InterfaceEntity>,
    @InjectModel(InterfaceCatEntity.name)
    private readonly catModel: Model<InterfaceCatEntity>,
    @InjectModel(InterfaceCaseEntity.name)
    private readonly caseModel: Model<InterfaceCaseEntity>,
    @InjectModel(ProjectEntity.name)
    private readonly projectModel: Model<ProjectEntity>,
    @InjectModel(GroupEntity.name)
    private readonly groupModel: Model<GroupEntity>,
    @InjectModel(UserEntity.name)
    private readonly userModel: Model<UserEntity>,
    private readonly counterService: CounterService,
    private readonly projectService: ProjectCompatService,
    private readonly cacheService: InterfaceTreeCacheService
  ) {}

  async add(payload: Record<string, unknown>, options: AccessOptions): Promise<Record<string, unknown>> {
    const projectId = this.mustNumber(payload.project_id, '项目id不能为空');
    const catid = this.mustNumber(payload.catid, 'catid不能为空');
    const title = this.mustString(payload.title, 'title不能为空');
    const path = this.mustString(payload.path, 'path不能为空');
    const method = this.normalizeMethod(payload.method);

    await this.projectService.assertProjectPermission(projectId, 'edit', options);
    await this.requireCat(catid, projectId);

    const queryData = normalizePath(path);
    if (!verifyPath(queryData.queryPath.path)) {
      throw new Error('path第一位必需为 /, 只允许由 字母数字-/_:.! 组成');
    }

    const duplicate = await this.interfaceModel.countDocuments({ project_id: projectId, path, method });
    if (duplicate > 0) {
      throw new Error(`已存在的接口:${path}[${method}]`);
    }

    const reqParams = this.normalizeReqParams(payload.req_params);
    handleVarPath(path, reqParams);
    const data = this.pickInterfaceFields(payload, true);
    data._id = await this.counterService.next('interface', '_id', 11);
    data.uid = this.actorUid(options.user);
    data.title = title;
    data.path = path;
    data.method = method;
    data.project_id = projectId;
    data.catid = catid;
    data.type = reqParams.length > 0 ? 'var' : 'static';
    data.req_params = reqParams;
    data.query_path = queryData.queryPath;
    data.req_headers = this.normalizeHeaders(
      data.req_body_type || 'raw',
      data.req_headers,
      data.req_body_form
    );
    data.add_time = this.now();
    data.up_time = this.now();

    const row = await this.interfaceModel.create(data);
    await this.ensureProjectMember(projectId, options.user);
    await this.autoAddTag(projectId, data.tag);
    await this.touchProject(projectId);
    this.cacheService.invalidateProject(projectId);
    return row.toObject() as unknown as Record<string, unknown>;
  }

  async save(payload: Record<string, unknown>, options: AccessOptions): Promise<Record<string, unknown>> {
    const projectId = this.mustNumber(payload.project_id, '项目id不能为空');
    const path = this.mustString(payload.path, 'path不能为空');
    const method = this.normalizeMethod(payload.method);
    await this.projectService.assertProjectPermission(projectId, 'edit', options);

    const existed = await this.interfaceModel
      .find({ project_id: projectId, path, method })
      .select('_id res_body res_body_is_json_schema')
      .lean();

    if (existed.length === 0) {
      return this.add(payload, options);
    }

    const updates = [];
    for (const item of existed) {
      const copy: Record<string, unknown> = { ...payload, id: item._id };
      if (
        payload.res_body_is_json_schema === true &&
        payload.dataSync === 'good' &&
        item.res_body_is_json_schema === true
      ) {
        const merged = this.mergeJsonSchema(item.res_body, payload.res_body);
        if (merged) {
          copy.res_body = merged;
        }
      }
      updates.push(this.update(copy, options));
    }
    await Promise.all(updates);
    return existed[0] as unknown as Record<string, unknown>;
  }

  async getById(
    id: number,
    options: AccessOptions & {
      projectId?: number;
    }
  ): Promise<Record<string, unknown>> {
    const row = await this.interfaceModel.findOne({ _id: id }).lean();
    if (!row) {
      throw new NotFoundException('不存在的接口');
    }
    if (options.token && options.projectId && options.projectId !== row.project_id) {
      throw new Error('token有误');
    }
    await this.projectService.assertProjectPermission(row.project_id, 'view', options);
    const user = await this.userModel.findOne({ _id: row.uid }).select('username').lean();
    return {
      ...row,
      username: user?.username || ''
    };
  }

  async list(filter: ListFilter): Promise<Record<string, unknown>> {
    await this.projectService.assertProjectPermission(filter.projectId, 'view', {
      token: filter.token,
      user: filter.user
    });

    const option: Record<string, unknown> = {
      project_id: filter.projectId
    };
    this.applyStatusTagFilter(option, filter.status, filter.tag);

    if (filter.limit === 'all') {
      const list = await this.interfaceModel
        .find(option)
        .sort({ title: 1 })
        .lean();
      const count = await this.interfaceModel.countDocuments(option);
      return {
        count,
        total: 1,
        list
      };
    }

    const page = this.safePage(filter.page);
    const limit = this.safeLimit(filter.limit, 10);
    const [count, list] = await Promise.all([
      this.interfaceModel.countDocuments(option),
      this.interfaceModel
        .find(option)
        .sort({ index: 1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
    ]);
    return {
      count,
      total: Math.ceil(count / limit),
      list
    };
  }

  async listByCat(filter: CatListFilter): Promise<Record<string, unknown>> {
    const cat = await this.requireCat(filter.catid);
    await this.projectService.assertProjectPermission(cat.project_id, 'view', {
      token: filter.token,
      user: filter.user
    });
    const option: Record<string, unknown> = { catid: filter.catid };
    this.applyStatusTagFilter(option, filter.status, filter.tag);
    const page = this.safePage(filter.page);
    const limit = this.safeLimit(filter.limit, 10);
    const [count, list] = await Promise.all([
      this.interfaceModel.countDocuments(option),
      this.interfaceModel
        .find(option)
        .sort({ index: 1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
    ]);
    return {
      count,
      total: Math.ceil(count / limit),
      list
    };
  }

  async listByOpen(projectId: number, options: AccessOptions): Promise<Record<string, unknown>[]> {
    const project = await this.projectService.assertProjectPermission(projectId, 'view', options);
    const list = await this.interfaceModel
      .find({ project_id: projectId, api_opened: true })
      .sort({ catid: 1, index: 1, title: 1 })
      .lean();
    return list.map(item => ({
      ...item,
      basepath: project.basepath || ''
    }));
  }

  async update(payload: Record<string, unknown>, options: AccessOptions): Promise<Record<string, unknown>> {
    const id = this.mustNumber(payload.id, '接口id不能为空');
    const existed = await this.interfaceModel.findOne({ _id: id }).lean();
    if (!existed) {
      throw new Error('不存在的接口');
    }

    await this.projectService.assertProjectPermission(existed.project_id, 'edit', options);

    const data = this.pickInterfaceFields(payload, false);
    const method = typeof payload.method === 'undefined' ? undefined : this.normalizeMethod(payload.method);
    if (method) {
      data.method = method;
    }
    if (typeof payload.path === 'string') {
      const path = this.mustString(payload.path, 'path不能为空');
      const queryData = normalizePath(path);
      if (!verifyPath(queryData.queryPath.path)) {
        throw new Error('path第一位必需为 /, 只允许由 字母数字-/_:.! 组成');
      }
      data.path = path;
      data.query_path = queryData.queryPath;
    }

    if (data.path && data.method && (data.path !== existed.path || data.method !== existed.method)) {
      const duplicate = await this.interfaceModel.countDocuments({
        project_id: existed.project_id,
        path: data.path,
        method: data.method,
        _id: { $ne: id }
      });
      if (duplicate > 0) {
        throw new Error(`已存在的接口:${data.path}[${data.method}]`);
      }
    }

    if (Array.isArray(data.req_params)) {
      data.type = data.req_params.length > 0 ? 'var' : 'static';
      if (data.type === 'var' && data.path) {
        handleVarPath(data.path, data.req_params as Array<{ name: string; desc?: string }>);
      }
    }
    if (typeof data.req_body_type === 'string') {
      data.req_headers = this.normalizeHeaders(
        data.req_body_type,
        Array.isArray(data.req_headers) ? data.req_headers : existed.req_headers || [],
        Array.isArray(data.req_body_form) ? data.req_body_form : existed.req_body_form || []
      );
    }

    data.up_time = this.now();
    const result = await this.interfaceModel.updateOne({ _id: id }, { $set: data });
    await this.autoAddTag(existed.project_id, data.tag);
    await this.touchProject(existed.project_id);
    this.cacheService.invalidateProject(existed.project_id);
    return {
      acknowledged: result.acknowledged,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount
    };
  }

  async del(id: number, options: AccessOptions): Promise<Record<string, unknown>> {
    const row = await this.interfaceModel.findOne({ _id: id }).lean();
    if (!row) {
      throw new Error('不存在的接口');
    }

    const actorUid = this.actorUid(options.user);
    if (row.uid === actorUid) {
      await this.projectService.assertProjectPermission(row.project_id, 'view', options);
    } else {
      await this.projectService.assertProjectPermission(row.project_id, 'danger', options);
    }

    const result = await this.interfaceModel.deleteOne({ _id: id });
    await this.caseModel.deleteMany({ interface_id: id });
    await this.touchProject(row.project_id);
    this.cacheService.invalidateProject(row.project_id);
    return {
      acknowledged: result.acknowledged,
      deletedCount: result.deletedCount || 0
    };
  }

  async addCat(
    payload: { project_id: number; name: string; desc?: string },
    options: AccessOptions
  ): Promise<Record<string, unknown>> {
    const projectId = this.mustNumber(payload.project_id, '项目id不能为空');
    const name = this.mustString(payload.name, '名称不能为空');
    await this.projectService.assertProjectPermission(projectId, 'edit', options);

    const id = await this.counterService.next('interface_cat', '_id', 11);
    const data: InterfaceCatEntity = {
      _id: id,
      project_id: projectId,
      uid: this.actorUid(options.user),
      name,
      desc: payload.desc || '',
      index: 0,
      add_time: this.now(),
      up_time: this.now()
    };
    const row = await this.catModel.create(data);
    await this.touchProject(projectId);
    this.cacheService.invalidateProject(projectId);
    return row.toObject() as unknown as Record<string, unknown>;
  }

  async upCat(
    payload: { catid: number; name?: string; desc?: string },
    options: AccessOptions
  ): Promise<Record<string, unknown>> {
    const catid = this.mustNumber(payload.catid, 'catid不能为空');
    const cat = await this.requireCat(catid);
    await this.projectService.assertProjectPermission(cat.project_id, 'edit', options);
    const data: Record<string, unknown> = {
      up_time: this.now()
    };
    if (typeof payload.name === 'string') {
      data.name = payload.name.trim();
    }
    if (typeof payload.desc === 'string') {
      data.desc = payload.desc;
    }
    const result = await this.catModel.updateOne({ _id: catid }, { $set: data });
    this.cacheService.invalidateProject(cat.project_id);
    return {
      acknowledged: result.acknowledged,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount
    };
  }

  async delCat(catid: number, options: AccessOptions): Promise<Record<string, unknown>> {
    const cat = await this.requireCat(catid);
    const actorUid = this.actorUid(options.user);
    if (cat.uid === actorUid) {
      await this.projectService.assertProjectPermission(cat.project_id, 'view', options);
    } else {
      await this.projectService.assertProjectPermission(cat.project_id, 'danger', options);
    }

    const interfaces = await this.interfaceModel.find({ catid }).select('_id').lean();
    const interfaceIds = interfaces.map(item => item._id);
    const [catResult, interfaceResult] = await Promise.all([
      this.catModel.deleteOne({ _id: catid }),
      this.interfaceModel.deleteMany({ catid })
    ]);
    if (interfaceIds.length > 0) {
      await this.caseModel.deleteMany({ interface_id: { $in: interfaceIds } });
    }
    await this.touchProject(cat.project_id);
    this.cacheService.invalidateProject(cat.project_id);
    return {
      acknowledged: catResult.acknowledged && interfaceResult.acknowledged,
      catDeletedCount: catResult.deletedCount || 0,
      interfaceDeletedCount: interfaceResult.deletedCount || 0
    };
  }

  async getCatMenu(projectId: number, options: AccessOptions): Promise<InterfaceCatEntity[]> {
    await this.projectService.assertProjectPermission(projectId, 'view', options);
    return this.catModel
      .find({ project_id: projectId })
      .sort({ index: 1, _id: 1 })
      .lean();
  }

  async getCustomField(
    customFieldName: string,
    customFieldValue: string
  ): Promise<Array<Record<string, unknown>>> {
    const groups = await this.groupModel
      .find({
        'custom_field1.name': customFieldName,
        'custom_field1.enable': true
      })
      .select('_id')
      .lean();
    if (groups.length === 0) {
      throw new NotFoundException('没有找到对应自定义接口');
    }
    const groupIds = groups.map(item => item._id);
    const projects = await this.projectModel
      .find({ group_id: { $in: groupIds } })
      .select('_id name')
      .lean();
    if (projects.length === 0) {
      return [];
    }

    const output: Array<Record<string, unknown>> = [];
    for (const project of projects) {
      const interfaces = await this.interfaceModel
        .find({
          project_id: project._id,
          custom_field_value: customFieldValue
        } as any)
        .lean();
      if (interfaces.length === 0) continue;
      output.push({
        project_name: project.name,
        project_id: project._id,
        list: interfaces.map(item => ({
          ...item,
          res_body: this.tryParseJson(item.res_body),
          req_body_other: this.tryParseJson(item.req_body_other)
        }))
      });
    }
    return output;
  }

  async upIndex(items: Array<{ id: number; index?: number }>): Promise<void> {
    const writes = items
      .map(item => ({
        updateOne: {
          filter: { _id: item.id },
          update: { $set: { index: Number(item.index) || 0 } }
        }
      }))
      .filter(item => item.updateOne.filter._id);
    if (writes.length === 0) return;
    await this.interfaceModel.bulkWrite(writes, { ordered: false });
  }

  async upCatIndex(items: Array<{ id: number; index?: number }>): Promise<void> {
    const writes = items
      .map(item => ({
        updateOne: {
          filter: { _id: item.id },
          update: { $set: { index: Number(item.index) || 0 } }
        }
      }))
      .filter(item => item.updateOne.filter._id);
    if (writes.length === 0) return;
    await this.catModel.bulkWrite(writes, { ordered: false });
  }

  private normalizeMethod(input: unknown): string {
    const source = typeof input === 'string' && input.trim() ? input.trim() : 'GET';
    return source.toUpperCase();
  }

  private pickInterfaceFields(payload: Record<string, unknown>, withDefaults: boolean): Record<string, any> {
    const data: Record<string, any> = {};
    const has = (key: string) => Object.prototype.hasOwnProperty.call(payload, key);
    const set = (key: string, value: unknown) => {
      if (withDefaults || has(key)) {
        data[key] = value;
      }
    };

    set('desc', this.toOptionalString(payload.desc) || '');
    set('status', this.normalizeStatus(payload.status));
    set('req_query', this.toArray(payload.req_query));
    set('req_headers', this.toArray(payload.req_headers));
    set('req_body_type', this.toReqBodyType(payload.req_body_type));
    set('req_params', this.normalizeReqParams(payload.req_params));
    set('req_body_form', this.toArray(payload.req_body_form));
    set('req_body_other', this.toOptionalString(payload.req_body_other) || '');
    set('req_body_is_json_schema', payload.req_body_is_json_schema === true);
    set('res_body_type', this.toResBodyType(payload.res_body_type));
    set('res_body', this.toOptionalString(payload.res_body) || '');
    set('res_body_is_json_schema', payload.res_body_is_json_schema === true);
    set('custom_field_value', this.toOptionalString(payload.custom_field_value) || '');
    set('api_opened', payload.api_opened === true);
    set('operation_oas3', this.toOptionalString(payload.operation_oas3) || '');
    set('import_meta', this.toOptionalString(payload.import_meta) || '');
    set('markdown', this.toOptionalString(payload.markdown) || '');
    set('tag', this.toTagArray(payload.tag));

    if (withDefaults || has('catid')) {
      const catid = Number(payload.catid);
      if (Number.isFinite(catid)) {
        data.catid = catid;
      }
    }
    if (withDefaults || has('title')) {
      data.title = this.toOptionalString(payload.title) || '';
    }
    if (withDefaults || has('path')) {
      data.path = this.toOptionalString(payload.path) || '';
    }
    return data;
  }

  private applyStatusTagFilter(
    option: Record<string, unknown>,
    status: string | string[] | undefined,
    tag: string | string[] | undefined
  ): void {
    if (status) {
      option.status = Array.isArray(status) ? { $in: status } : status;
    }
    if (tag) {
      option.tag = Array.isArray(tag) ? { $in: tag } : tag;
    }
  }

  private async requireCat(catid: number, projectId?: number): Promise<InterfaceCatEntity> {
    const cat = await this.catModel.findOne({ _id: catid }).lean();
    if (!cat) {
      throw new NotFoundException('不存在的分类');
    }
    if (projectId && cat.project_id !== projectId) {
      throw new Error('catid与project_id不匹配');
    }
    return cat;
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

  private async ensureProjectMember(projectId: number, user: SessionUser | null | undefined): Promise<void> {
    if (!user || user.role === 'admin' || user._id === 999999) return;
    await this.projectModel.updateOne(
      {
        _id: projectId,
        'members.uid': { $ne: user._id }
      },
      {
        $push: {
          members: {
            uid: user._id,
            role: 'dev',
            username: user.username,
            email: user.email,
            email_notice: true
          }
        }
      }
    );
  }

  private async autoAddTag(projectId: number, tags: string[]): Promise<void> {
    if (!Array.isArray(tags) || tags.length === 0) return;
    const project = await this.projectModel.findOne({ _id: projectId }).select('tag').lean();
    const projectTags = Array.isArray(project?.tag) ? [...project.tag] : [];
    let changed = false;
    for (const tag of tags) {
      if (!tag) continue;
      if (projectTags.find(item => item?.name === tag)) continue;
      changed = true;
      projectTags.push({
        name: tag,
        desc: tag
      });
    }
    if (!changed) return;
    await this.projectModel.updateOne(
      { _id: projectId },
      {
        $set: {
          tag: projectTags,
          up_time: this.now()
        }
      }
    );
  }

  private normalizeHeaders(
    reqBodyType: string,
    reqHeadersInput: Array<Record<string, any>>,
    reqBodyFormInput: Array<Record<string, any>>
  ): Array<Record<string, any>> {
    const reqHeaders = Array.isArray(reqHeadersInput) ? [...reqHeadersInput] : [];
    const reqBodyForm = Array.isArray(reqBodyFormInput) ? reqBodyFormInput : [];
    let hasContentType = false;
    let isFile = false;

    if (reqBodyType === 'form') {
      for (const item of reqBodyForm) {
        if (item?.type === 'file') {
          isFile = true;
        }
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

  private mergeJsonSchema(
    oldBody: unknown,
    newBody: unknown
  ): string | null {
    try {
      const oldValue = this.tryParseJson(oldBody);
      const newValue = this.tryParseJson(newBody);
      return JSON.stringify(mergeJsonSchema(oldValue, newValue), null, 2);
    } catch (_err) {
      return null;
    }
  }

  private tryParseJson(input: unknown): unknown {
    if (typeof input !== 'string') return input;
    try {
      return JSON.parse(input);
    } catch (_err) {
      return input;
    }
  }

  private actorUid(user: SessionUser | null | undefined): number {
    return user?._id || 999999;
  }

  private normalizeStatus(input: unknown): 'undone' | 'done' {
    if (typeof input === 'string' && input.toLowerCase() === 'done') {
      return 'done';
    }
    return 'undone';
  }

  private toReqBodyType(input: unknown): string {
    const value = this.toOptionalString(input)?.toLowerCase();
    if (!value) return 'raw';
    if (value === 'form' || value === 'json' || value === 'text' || value === 'file' || value === 'raw') {
      return value;
    }
    return 'raw';
  }

  private toResBodyType(input: unknown): string {
    const value = this.toOptionalString(input)?.toLowerCase();
    if (!value) return 'raw';
    if (value === 'json' || value === 'text' || value === 'xml' || value === 'raw' || value === 'json-schema') {
      return value;
    }
    return 'raw';
  }

  private toTagArray(input: unknown): string[] {
    const source = this.toArray(input);
    return source
      .map(item => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }

  private normalizeReqParams(input: unknown): Array<{ name: string; desc?: string; example?: string }> {
    const source = this.toArray(input);
    const output: Array<{ name: string; desc?: string; example?: string }> = [];
    for (const item of source) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const name = this.toOptionalString(row.name);
      if (!name) continue;
      output.push({
        name,
        desc: this.toOptionalString(row.desc) || '',
        example: this.toOptionalString(row.example) || ''
      });
    }
    return output;
  }

  private toArray(input: unknown): any[] {
    if (Array.isArray(input)) return input;
    if (typeof input === 'string' && input.trim()) {
      try {
        const parsed = JSON.parse(input);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch (_err) {}
    }
    return [];
  }

  private toOptionalString(input: unknown): string | undefined {
    if (typeof input !== 'string') return undefined;
    const value = input.trim();
    return value || undefined;
  }

  private mustString(input: unknown, errmsg: string): string {
    const value = this.toOptionalString(input);
    if (!value) {
      throw new Error(errmsg);
    }
    return value;
  }

  private mustNumber(input: unknown, errmsg: string): number {
    const value = Number(input);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(errmsg);
    }
    return value;
  }

  private safePage(page: number | undefined): number {
    if (!page || !Number.isFinite(page) || page <= 0) return 1;
    return Math.floor(page);
  }

  private safeLimit(limit: number | undefined | 'all', fallback: number): number {
    if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0) {
      return fallback;
    }
    return Math.floor(limit);
  }

  private now(): number {
    return Math.floor(Date.now() / 1000);
  }
}
