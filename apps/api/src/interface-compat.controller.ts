import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import type { SpecFormat, SpecSource, SyncMode } from '@yapi-next/shared-types';
import { resReturn } from './common/api-response';
import { mapError } from './common/error-response';
import { InputMap, hasHttpPrefix, pickJson, pickNumber, pickOneOrMany, pickString } from './common/request-utils';
import { InterfaceCompatService } from './services/interface-compat.service';
import { ProjectCompatService } from './services/project-compat.service';
import { SessionAuthService } from './services/session-auth.service';
import { SpecService } from './services/spec.service';

@Controller('interface')
export class InterfaceCompatController {
  constructor(
    private readonly sessionService: SessionAuthService,
    private readonly interfaceService: InterfaceCompatService,
    private readonly projectService: ProjectCompatService,
    private readonly specService: SpecService
  ) {}

  @Post('add')
  async add(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      const token = pickString(body.token);
      const user = await this.sessionService.getCurrentUser(req);
      if (!user && !token) {
        return resReturn(null, 40011, '请登录...');
      }
      const result = await this.interfaceService.add(body, { user, token });
      return resReturn(result);
    } catch (err) {
      return this.mapWriteError(err, { duplicateCode: 40022, noAuthCode: 40033 });
    }
  }

  @Post('save')
  async save(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      const token = pickString(body.token);
      const user = await this.sessionService.getCurrentUser(req);
      if (!user && !token) {
        return resReturn(null, 40011, '请登录...');
      }
      const result = await this.interfaceService.save(body, { user, token });
      return resReturn(result);
    } catch (err) {
      return this.mapWriteError(err, { duplicateCode: 40022, noAuthCode: 40033 });
    }
  }

  @Get('get')
  async get(@Req() req: FastifyRequest, @Query() query: InputMap) {
    try {
      const id = pickNumber(query.id);
      if (!id) {
        return resReturn(null, 400, '接口id不能为空');
      }
      const token = pickString(query.token);
      const user = await this.sessionService.getCurrentUser(req);
      if (!user && !token) {
        return resReturn(null, 40011, '请登录...');
      }
      const result = await this.interfaceService.getById(id, {
        user,
        token,
        projectId: pickNumber(query.project_id)
      });
      return resReturn(result);
    } catch (err) {
      const mapped = mapError(err);
      if (mapped.errmsg === '不存在的接口') {
        return resReturn(null, 490, mapped.errmsg);
      }
      if (mapped.errmsg === '没有权限') {
        return resReturn(null, 406, mapped.errmsg);
      }
      if (mapped.errmsg === 'token有误') {
        return resReturn(null, 400, mapped.errmsg);
      }
      return resReturn(null, 402, mapped.errmsg);
    }
  }

  @Get('list')
  async list(@Req() req: FastifyRequest, @Query() query: InputMap) {
    try {
      const projectId = pickNumber(query.project_id);
      if (!projectId) {
        return resReturn(null, 400, '项目id不能为空');
      }
      const token = pickString(query.token);
      const user = await this.sessionService.getCurrentUser(req);
      if (!user && !token) {
        return resReturn(null, 40011, '请登录...');
      }
      const result = await this.interfaceService.list({
        projectId,
        page: pickNumber(query.page),
        limit: this.pickLimit(query.limit),
        status: pickOneOrMany(query.status),
        tag: pickOneOrMany(query.tag),
        token,
        user
      });
      return resReturn(result);
    } catch (err) {
      return this.mapReadError(err);
    }
  }

  @Get('list_cat')
  async listByCat(@Req() req: FastifyRequest, @Query() query: InputMap) {
    try {
      const catid = pickNumber(query.catid);
      if (!catid) {
        return resReturn(null, 400, 'catid不能为空');
      }
      const token = pickString(query.token);
      const user = await this.sessionService.getCurrentUser(req);
      if (!user && !token) {
        return resReturn(null, 40011, '请登录...');
      }
      const result = await this.interfaceService.listByCat({
        catid,
        page: pickNumber(query.page),
        limit: pickNumber(query.limit),
        status: pickOneOrMany(query.status),
        tag: pickOneOrMany(query.tag),
        token,
        user
      });
      return resReturn(result);
    } catch (err) {
      return this.mapReadError(err);
    }
  }

  @Get('list_open')
  async listByOpen(@Req() req: FastifyRequest, @Query() query: InputMap) {
    try {
      const projectId = pickNumber(query.project_id);
      if (!projectId) {
        return resReturn(null, 400, '项目id不能为空');
      }
      const token = pickString(query.token);
      const user = await this.sessionService.getCurrentUser(req);
      if (!user && !token) {
        return resReturn(null, 40011, '请登录...');
      }
      const result = await this.interfaceService.listByOpen(projectId, { user, token });
      return resReturn(result);
    } catch (err) {
      return this.mapReadError(err);
    }
  }

  @Post('up')
  async up(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      const token = pickString(body.token);
      const user = await this.sessionService.getCurrentUser(req);
      if (!user && !token) {
        return resReturn(null, 40011, '请登录...');
      }
      const result = await this.interfaceService.update(body, { user, token });
      return resReturn(result);
    } catch (err) {
      return this.mapWriteError(err, { duplicateCode: 401, noAuthCode: 400 });
    }
  }

  @Post('del')
  async del(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      const id = pickNumber(body.id);
      if (!id) {
        return resReturn(null, 400, '接口id不能为空');
      }
      const token = pickString(body.token);
      const user = await this.sessionService.getCurrentUser(req);
      if (!user && !token) {
        return resReturn(null, 40011, '请登录...');
      }
      const result = await this.interfaceService.del(id, { user, token });
      return resReturn(result);
    } catch (err) {
      return this.mapWriteError(err, { noAuthCode: 400 });
    }
  }

  @Post('add_cat')
  async addCat(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      const token = pickString(body.token);
      const user = await this.sessionService.getCurrentUser(req);
      if (!user && !token) {
        return resReturn(null, 40011, '请登录...');
      }
      const result = await this.interfaceService.addCat(
        {
          project_id: pickNumber(body.project_id) || 0,
          name: pickString(body.name) || '',
          desc: pickString(body.desc)
        },
        { user, token }
      );
      return resReturn(result);
    } catch (err) {
      return this.mapWriteError(err, { noAuthCode: 400 });
    }
  }

  @Post('up_cat')
  async upCat(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      const token = pickString(body.token);
      const user = await this.sessionService.getCurrentUser(req);
      if (!user && !token) {
        return resReturn(null, 40011, '请登录...');
      }
      const result = await this.interfaceService.upCat(
        {
          catid: pickNumber(body.catid) || 0,
          name: pickString(body.name),
          desc: pickString(body.desc)
        },
        { user, token }
      );
      return resReturn(result);
    } catch (err) {
      return this.mapWriteError(err, { noAuthCode: 400 });
    }
  }

  @Post('del_cat')
  async delCat(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      const catid = pickNumber(body.catid);
      if (!catid) {
        return resReturn(null, 400, 'catid不能为空');
      }
      const token = pickString(body.token);
      const user = await this.sessionService.getCurrentUser(req);
      if (!user && !token) {
        return resReturn(null, 40011, '请登录...');
      }
      const result = await this.interfaceService.delCat(catid, { user, token });
      return resReturn(result);
    } catch (err) {
      return this.mapWriteError(err, { noAuthCode: 400 });
    }
  }

  @Get('getCatMenu')
  async getCatMenu(@Req() req: FastifyRequest, @Query() query: InputMap) {
    try {
      const projectId = pickNumber(query.project_id);
      if (!projectId) {
        return resReturn(null, 400, '项目id不能为空');
      }
      const token = pickString(query.token);
      const user = await this.sessionService.getCurrentUser(req);
      if (!user && !token) {
        return resReturn(null, 40011, '请登录...');
      }
      const result = await this.interfaceService.getCatMenu(projectId, { user, token });
      return resReturn(result);
    } catch (err) {
      return this.mapReadError(err);
    }
  }

  @Get('get_custom_field')
  async getCustomField(@Req() req: FastifyRequest, @Query() query: InputMap) {
    try {
      const user = await this.sessionService.getCurrentUser(req);
      if (!user) {
        return resReturn(null, 40011, '请登录...');
      }
      const keys = Object.keys(query);
      if (keys.length !== 1) {
        return resReturn(null, 400, '参数数量错误');
      }
      const fieldName = keys[0];
      const fieldValue = String(query[fieldName] || '');
      const result = await this.interfaceService.getCustomField(fieldName, fieldValue);
      return resReturn(result);
    } catch (err) {
      const mapped = mapError(err);
      if (mapped.errcode === 404) {
        return resReturn(null, 404, mapped.errmsg);
      }
      return resReturn(null, 400, mapped.errmsg);
    }
  }

  @Post('up_index')
  async upIndex(@Req() req: FastifyRequest, @Body() body: unknown) {
    const user = await this.sessionService.getCurrentUser(req);
    if (!user) {
      return resReturn(null, 40011, '请登录...');
    }
    if (!Array.isArray(body)) {
      return resReturn(null, 400, '请求参数必须是数组');
    }
    try {
      await this.interfaceService.upIndex(body as Array<{ id: number; index?: number }>);
      return resReturn('成功！');
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(null, 400, mapped.errmsg);
    }
  }

  @Post('up_cat_index')
  async upCatIndex(@Req() req: FastifyRequest, @Body() body: unknown) {
    const user = await this.sessionService.getCurrentUser(req);
    if (!user) {
      return resReturn(null, 40011, '请登录...');
    }
    if (!Array.isArray(body)) {
      return resReturn(null, 400, '请求参数必须是数组');
    }
    try {
      await this.interfaceService.upCatIndex(body as Array<{ id: number; index?: number }>);
      return resReturn('成功！');
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(null, 400, mapped.errmsg);
    }
  }

  @Post('schema2json')
  async schema2json(@Req() req: FastifyRequest, @Body() body: InputMap) {
    const user = await this.sessionService.getCurrentUser(req);
    if (!user) {
      return resReturn(null, 40011, '请登录...');
    }
    const schema = body.schema;
    const alwaysFakeOptionals = typeof body.required === 'boolean' ? body.required : true;
    return this.schemaToJson(schema, alwaysFakeOptionals);
  }

  @Get('download_crx')
  async downloadCrx(@Res({ passthrough: true }) reply: FastifyReply) {
    const candidates = [
      path.resolve(process.cwd(), '../../static/attachment/cross-request.zip'),
      path.resolve(process.cwd(), '../../../static/attachment/cross-request.zip'),
      path.resolve(process.cwd(), 'static/attachment/cross-request.zip')
    ];
    const filepath = candidates.find(item => existsSync(item));
    if (!filepath) {
      return resReturn(null, 404, 'cross-request.zip 文件不存在');
    }
    reply.header('Content-disposition', 'attachment; filename=crossRequest.zip');
    reply.header('Content-Type', 'application/zip');
    return readFileSync(filepath);
  }

  @Post('interUpload')
  async interUpload(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      const user = await this.sessionService.getCurrentUser(req);
      const token = pickString(body.token);
      if (!user && !token) {
        return resReturn(null, 40011, '请登录...');
      }

      const projectId = await this.resolveProjectId(body, token);
      if (!projectId) {
        return resReturn(null, 400, 'project_id不能为空');
      }
      await this.projectService.assertProjectPermission(projectId, 'edit', { user, token });

      const source = this.normalizeCompatSource(body);
      const payloadJson = this.pickImportPayload(body);
      const urlValue = pickString(body.url);
      if (source === 'json' && !payloadJson) {
        return resReturn(null, 400, 'interfaceData/json不能为空');
      }
      if (source === 'url' && !urlValue && !payloadJson) {
        return resReturn(null, 400, 'url不能为空');
      }

      const result = await this.specService.import({
        projectId,
        source,
        format: this.normalizeCompatFormat(body),
        syncMode: this.normalizeCompatSyncMode(body),
        json: source === 'json' ? payloadJson : undefined,
        url: source === 'url' ? urlValue || payloadJson : undefined,
        uid: user?._id
      });
      return resReturn(result);
    } catch (err) {
      const mapped = mapError(err);
      if (mapped.errmsg === '没有权限') {
        return resReturn(null, 400, mapped.errmsg);
      }
      return resReturn(null, 400, mapped.errmsg);
    }
  }

  private async resolveProjectId(body: InputMap, token: string | undefined): Promise<number | undefined> {
    const direct = pickNumber(body.project_id) || pickNumber(body.projectid) || pickNumber(body.id);
    if (direct) return direct;
    if (!token) return undefined;
    const resolved = await this.projectService.resolveTokenProject(token);
    return resolved?.projectId;
  }

  private normalizeCompatSource(body: InputMap): SpecSource {
    const source = pickString(body.source);
    if (source === 'url') return 'url';
    const urlValue = pickString(body.url);
    const payload = this.pickImportPayload(body);
    if (urlValue || hasHttpPrefix(payload)) return 'url';
    return 'json';
  }

  private normalizeCompatFormat(body: InputMap): SpecFormat {
    const format = (pickString(body.format) || '').toLowerCase();
    if (format === 'swagger2' || format === 'openapi3') return format;
    const type = (pickString(body.type) || '').toLowerCase();
    if (type === 'swagger') return 'auto';
    return 'auto';
  }

  private normalizeCompatSyncMode(body: InputMap): SyncMode {
    const input = (
      pickString(body.syncMode) ||
      pickString(body.merge) ||
      pickString(body.dataSync) ||
      'normal'
    ).toLowerCase();
    if (input === 'good' || input === 'merge' || input === 'normal') {
      return input as SyncMode;
    }
    return 'normal';
  }

  private pickImportPayload(body: InputMap): string | undefined {
    const values = [body.interfaceData, body.json, body.content, body.data, body.swagger];
    for (const item of values) {
      const text = pickJson(item);
      if (text && text.trim()) return text;
    }
    return undefined;
  }

  private pickLimit(input: unknown): number | 'all' | undefined {
    if (typeof input === 'string' && input.trim().toLowerCase() === 'all') {
      return 'all';
    }
    return pickNumber(input);
  }

  private mapReadError(err: unknown) {
    const mapped = mapError(err);
    if (mapped.errmsg === '没有权限') {
      return resReturn(null, 406, mapped.errmsg);
    }
    if (mapped.errmsg === '不存在的项目') {
      return resReturn(null, 407, mapped.errmsg);
    }
    if (mapped.errmsg === '不存在的分类') {
      return resReturn(null, 404, mapped.errmsg);
    }
    return resReturn(null, 402, mapped.errmsg);
  }

  private mapWriteError(
    err: unknown,
    options: {
      duplicateCode?: number;
      noAuthCode?: number;
    }
  ) {
    const mapped = mapError(err);
    if (mapped.errmsg === '没有权限') {
      return resReturn(null, options.noAuthCode || 400, mapped.errmsg);
    }
    if (mapped.errmsg.startsWith('已存在的接口:')) {
      return resReturn(null, options.duplicateCode || 401, mapped.errmsg);
    }
    if (mapped.errmsg === '不存在的接口') {
      return resReturn(null, 400, mapped.errmsg);
    }
    if (mapped.errmsg === '不存在的分类') {
      return resReturn(null, 400, mapped.errmsg);
    }
    return resReturn(null, 400, mapped.errmsg);
  }

  private schemaToJson(schema: unknown, alwaysFakeOptionals: boolean): unknown {
    if (!schema || typeof schema !== 'object') {
      return null;
    }
    const node = schema as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(node, 'example')) {
      return node.example;
    }
    if (Array.isArray(node.enum) && node.enum.length > 0) {
      return node.enum[0];
    }
    if (Object.prototype.hasOwnProperty.call(node, 'default')) {
      return node.default;
    }

    const type = typeof node.type === 'string' ? node.type : undefined;
    if (type === 'object' || node.properties) {
      const properties =
        node.properties && typeof node.properties === 'object'
          ? (node.properties as Record<string, unknown>)
          : {};
      const required = Array.isArray(node.required)
        ? new Set(
            node.required
              .map(item => (typeof item === 'string' ? item : ''))
              .filter(Boolean)
          )
        : new Set<string>();
      const output: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(properties)) {
        const isRequired = required.has(key);
        if (!alwaysFakeOptionals && !isRequired) continue;
        output[key] = this.schemaToJson(value, alwaysFakeOptionals);
      }
      return output;
    }

    if (type === 'array' || node.items) {
      const itemSchema = node.items;
      if (!itemSchema) return [];
      return [this.schemaToJson(itemSchema, alwaysFakeOptionals)];
    }

    if (type === 'integer' || type === 'number') return 0;
    if (type === 'boolean') return true;
    if (type === 'null') return null;
    return '';
  }
}
