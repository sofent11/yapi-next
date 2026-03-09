import { Body, Controller, ForbiddenException, Get, NotFoundException, Post, Query, Req, Res } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { FastifyReply, FastifyRequest } from 'fastify';
import os from 'node:os';
import { Connection, Model, Types } from 'mongoose';
import { resReturn } from './common/api-response';
import { mapError } from './common/error-response';
import { InputMap, pickBoolean, pickNumber, pickString } from './common/request-utils';
import { GroupEntity } from './database/schemas/group.schema';
import { InterfaceCaseEntity } from './database/schemas/interface-case.schema';
import { InterfaceCatEntity } from './database/schemas/interface-cat.schema';
import { InterfaceEntity } from './database/schemas/interface.schema';
import { ProjectEntity } from './database/schemas/project.schema';
import { UserEntity } from './database/schemas/user.schema';
import { ProjectAuthService } from './services/project-auth.service';
import { SessionAuthService, SessionUser } from './services/session-auth.service';
import { SpecService } from './services/spec.service';

type PluginDoc = Record<string, unknown>;

@Controller('plugin')
export class PluginCompatController {
  constructor(
    private readonly specService: SpecService,
    private readonly projectAuthService: ProjectAuthService,
    private readonly sessionService: SessionAuthService,
    @InjectConnection()
    private readonly connection: Connection,
    @InjectModel(GroupEntity.name)
    private readonly groupModel: Model<GroupEntity>,
    @InjectModel(ProjectEntity.name)
    private readonly projectModel: Model<ProjectEntity>,
    @InjectModel(InterfaceCatEntity.name)
    private readonly interfaceCatModel: Model<InterfaceCatEntity>,
    @InjectModel(InterfaceEntity.name)
    private readonly interfaceModel: Model<InterfaceEntity>,
    @InjectModel(InterfaceCaseEntity.name)
    private readonly interfaceCaseModel: Model<InterfaceCaseEntity>,
    @InjectModel(UserEntity.name)
    private readonly userModel: Model<UserEntity>
  ) {}

  @Get('exportSwagger')
  async exportSwagger(@Query() query: InputMap, @Res({ passthrough: true }) reply: FastifyReply) {
    try {
      const token = pickString(query.token);
      const projectId = await this.projectAuthService.resolveProjectId(
        pickNumber(query.pid) || pickNumber(query.project_id),
        token
      );
      await this.projectAuthService.assertProjectReadable(projectId, token);

      const status = this.normalizeStatus(pickString(query.status));
      const type = pickString(query.type);
      const format = this.normalizeExportType(type);
      const content = await this.specService.export({ projectId, format, status });

      reply.header('Content-Type', 'application/octet-stream');
      reply.header(
        'Content-Disposition',
        format === 'openapi3'
          ? 'attachment; filename=openapi3.json'
          : 'attachment; filename=swaggerApi.json'
      );
      return content;
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(null, mapped.errcode, mapped.errmsg);
    }
  }

  @Get('export')
  async exportData(
    @Req() req: FastifyRequest,
    @Query() query: InputMap,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    try {
      const token = pickString(query.token);
      const projectId = await this.projectAuthService.resolveProjectId(
        pickNumber(query.pid) || pickNumber(query.project_id),
        token
      );
      await this.assertProjectReadableWithSession(req, projectId, token);

      const exportType = pickString(query.type) || 'html';
      const status = this.normalizeStatus(pickString(query.status));
      const withWiki = pickBoolean(query.isWiki);
      const fullPath = pickBoolean(query.fullPath);
      const payload = await this.buildLegacyExportData(projectId, status, {
        withWiki,
        fullPath
      });

      reply.header('Content-Type', 'application/octet-stream');
      if (exportType === 'json') {
        reply.header('Content-Disposition', 'attachment; filename=api.json');
        return JSON.stringify(payload.list, null, 2);
      }
      if (exportType === 'markdown') {
        reply.header('Content-Disposition', 'attachment; filename=api.md');
        return this.renderMarkdown(payload.project, payload.list, payload.wikiMarkdown);
      }
      reply.header('Content-Disposition', 'attachment; filename=api.html');
      return this.renderHtml(payload.project, payload.list, payload.wikiMarkdown);
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(null, mapped.errcode, mapped.errmsg);
    }
  }

  @Get('statismock/count')
  async getStatisticsCount(@Req() req: FastifyRequest) {
    try {
      await this.assertAdmin(req);
      const [groupCount, projectCount, interfaceCount, interfaceCaseCount] = await Promise.all([
        this.groupModel.countDocuments({}),
        this.projectModel.countDocuments({}),
        this.interfaceModel.countDocuments({}),
        this.interfaceCaseModel.countDocuments({})
      ]);
      return resReturn({
        groupCount,
        projectCount,
        interfaceCount,
        interfaceCaseCount
      });
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(null, mapped.errcode === 403 ? 405 : mapped.errcode, mapped.errmsg);
    }
  }

  @Get('statismock/get')
  async getStatisticsMock(@Req() req: FastifyRequest) {
    try {
      await this.assertAdmin(req);
      const col = this.collection('statis_mock');
      const mockCount = await col.countDocuments({});
      const [startDate, endDate] = this.lastDaysRange(30);
      const mockDateList = await col
        .aggregate([
          {
            $match: {
              date: { $gt: startDate, $lte: endDate }
            }
          },
          {
            $group: {
              _id: '$date',
              count: { $sum: 1 }
            }
          },
          {
            $sort: { _id: 1 }
          }
        ])
        .toArray();
      return resReturn({ mockCount, mockDateList });
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(null, mapped.errcode === 403 ? 405 : mapped.errcode, mapped.errmsg);
    }
  }

  @Get('statismock/get_system_status')
  async getStatisticsSystemStatus(@Req() req: FastifyRequest) {
    try {
      await this.assertAdmin(req);
      const load = os.loadavg()[0] || 0;
      const data = {
        mail: '未配置',
        systemName: os.platform(),
        totalmem: this.formatBytes(os.totalmem()),
        freemem: this.formatBytes(os.freemem()),
        uptime: this.formatUptime(os.uptime()),
        load: (load * 100).toFixed(2)
      };
      return resReturn(data);
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(null, mapped.errcode === 403 ? 405 : mapped.errcode, mapped.errmsg);
    }
  }

  @Get('statismock/group_data_statis')
  async getStatisticsGroupData(@Req() req: FastifyRequest) {
    try {
      await this.assertAdmin(req);
      const statisCol = this.collection('statis_mock');
      const groups = await this.groupModel.find({}).select('_id group_name').lean();
      const projectRows = await this.projectModel
        .aggregate<{ _id: number; project: number; projectIds: number[] }>([
          {
            $group: {
              _id: '$group_id',
              project: { $sum: 1 },
              projectIds: { $push: '$_id' }
            }
          }
        ])
        .exec();
      const interfaceRows = await this.interfaceModel
        .aggregate<{ _id: number; interface: number }>([
          {
            $group: {
              _id: '$project_id',
              interface: { $sum: 1 }
            }
          }
        ])
        .exec();
      const mockRows = await statisCol
        .aggregate<{ _id: number; mock: number }>([
          {
            $group: {
              _id: '$group_id',
              mock: { $sum: 1 }
            }
          }
        ])
        .toArray();

      const interfaceByProject = new Map<number, number>();
      interfaceRows.forEach(item => {
        const projectId = Number(item._id || 0);
        if (projectId <= 0) return;
        interfaceByProject.set(projectId, Number(item.interface || 0));
      });

      const projectByGroup = new Map<number, { project: number; projectIds: number[] }>();
      projectRows.forEach(item => {
        const groupId = Number(item._id || 0);
        if (groupId <= 0) return;
        projectByGroup.set(groupId, {
          project: Number(item.project || 0),
          projectIds: Array.isArray(item.projectIds)
            ? item.projectIds
                .map((id: unknown) => Number(id || 0))
                .filter((id: number) => id > 0)
            : []
        });
      });

      const mockByGroup = new Map<number, number>();
      mockRows.forEach(item => {
        const groupId = Number(item._id || 0);
        if (groupId <= 0) return;
        mockByGroup.set(groupId, Number(item.mock || 0));
      });

      const rows: Array<{ name: string; interface: number; mock: number; project: number }> = groups.map(group => {
        const groupId = Number(group._id || 0);
        const projectMeta = projectByGroup.get(groupId);
        const projectIds = projectMeta?.projectIds || [];
        const interfaceCount = projectIds.reduce((sum, projectId) => {
          return sum + Number(interfaceByProject.get(projectId) || 0);
        }, 0);
        return {
          name: String(group.group_name || '-'),
          interface: interfaceCount,
          mock: Number(mockByGroup.get(groupId) || 0),
          project: Number(projectMeta?.project || 0)
        };
      });
      return resReturn(rows);
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(null, mapped.errcode === 403 ? 405 : mapped.errcode, mapped.errmsg);
    }
  }

  @Get('advmock/get')
  async getAdvMock(@Req() req: FastifyRequest, @Query() query: InputMap) {
    try {
      const interfaceId = pickNumber(query.interface_id);
      if (!interfaceId) {
        return resReturn(null, 408, '缺少interface_id');
      }
      await this.assertLoggedIn(req);
      const doc = await this.collection('adv_mock').findOne({ interface_id: interfaceId });
      if (!doc) {
        return resReturn(null, 408, 'mock脚本不存在');
      }
      return resReturn(doc as PluginDoc);
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(null, mapped.errcode, mapped.errmsg);
    }
  }

  @Post('advmock/save')
  async saveAdvMock(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      const interfaceId = pickNumber(body.interface_id);
      const projectId = pickNumber(body.project_id);
      if (!interfaceId) {
        return resReturn(null, 408, '缺少interface_id');
      }
      if (!projectId) {
        return resReturn(null, 408, '缺少project_id');
      }
      const token = pickString(body.token);
      const user = await this.assertProjectEditableWithSession(req, projectId, token);
      const now = this.nowSec();
      const payload = {
        interface_id: interfaceId,
        project_id: projectId,
        uid: user?._id || 0,
        enable: pickBoolean(body.enable),
        mock_script: pickString(body.mock_script) || '',
        up_time: now
      };
      const result = await this
        .collection('adv_mock')
        .updateOne({ interface_id: interfaceId }, { $set: payload }, { upsert: true });
      return resReturn(result as unknown as PluginDoc);
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(null, mapped.errcode, mapped.errmsg);
    }
  }

  @Get('advmock/case/list')
  async listAdvMockCase(@Req() req: FastifyRequest, @Query() query: InputMap) {
    try {
      const interfaceId = pickNumber(query.interface_id);
      if (!interfaceId) {
        return resReturn(null, 400, '缺少 interface_id');
      }
      await this.assertLoggedIn(req);
      const list = await this
        .collection('adv_mock_case')
        .find({ interface_id: interfaceId })
        .sort({ up_time: -1, _id: -1 })
        .toArray();
      const uidList = Array.from(
        new Set(
          list
            .map(item => Number(item.uid || 0))
            .filter(uid => Number.isFinite(uid) && uid > 0)
        )
      );
      const userRows =
        uidList.length > 0
          ? await this.userModel.find({ _id: { $in: uidList } }).select('_id username').lean()
          : [];
      const usernameMap = new Map<number, string>();
      userRows.forEach(item => usernameMap.set(Number(item._id || 0), String(item.username || '')));
      const output = list.map(item => ({
        ...item,
        username: usernameMap.get(Number(item.uid || 0)) || ''
      }));
      return resReturn(output as unknown as PluginDoc);
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(null, mapped.errcode, mapped.errmsg);
    }
  }

  @Post('advmock/case/save')
  async saveAdvMockCase(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      const interfaceId = pickNumber(body.interface_id);
      const projectId = pickNumber(body.project_id);
      if (!interfaceId) {
        return resReturn(null, 408, '缺少interface_id');
      }
      if (!projectId) {
        return resReturn(null, 408, '缺少project_id');
      }
      const resBody = pickString(body.res_body);
      if (!resBody) {
        return resReturn(null, 408, '请输入 Response Body');
      }
      const token = pickString(body.token);
      const user = await this.assertProjectEditableWithSession(req, projectId, token);
      const now = this.nowSec();
      const code = pickNumber(body.code);
      const delay = pickNumber(body.delay);
      const payload: PluginDoc = {
        interface_id: interfaceId,
        project_id: projectId,
        uid: user?._id || 0,
        ip_enable: pickBoolean(body.ip_enable),
        ip: pickString(body.ip) || '',
        name: pickString(body.name) || '',
        code: Number.isFinite(code || NaN) ? Number(code) : 200,
        delay: Number.isFinite(delay || NaN) ? Number(delay) : 0,
        headers: Array.isArray(body.headers) ? body.headers : [],
        params:
          body.params && typeof body.params === 'object'
            ? (body.params as Record<string, unknown>)
            : {},
        res_body: resBody,
        up_time: now
      };

      const idQuery = this.toIdQuery(body.id);
      if (idQuery) {
        await this.collection('adv_mock_case').updateOne(idQuery, { $set: payload });
        return resReturn({ ...payload, ...(idQuery as PluginDoc) });
      }
      const result = await this
        .collection('adv_mock_case')
        .insertOne({ ...payload, case_enable: true });
      return resReturn({ ...payload, _id: result.insertedId, case_enable: true });
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(null, mapped.errcode, mapped.errmsg);
    }
  }

  @Post('advmock/case/del')
  async delAdvMockCase(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      await this.assertLoggedIn(req);
      const idQuery = this.toIdQuery(body.id);
      if (!idQuery) {
        return resReturn(null, 408, '缺少 id');
      }
      const result = await this.collection('adv_mock_case').deleteOne(idQuery);
      return resReturn(result as unknown as PluginDoc);
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(null, mapped.errcode, mapped.errmsg);
    }
  }

  @Post('advmock/case/hide')
  async hideAdvMockCase(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      await this.assertLoggedIn(req);
      const idQuery = this.toIdQuery(body.id);
      if (!idQuery) {
        return resReturn(null, 408, '缺少 id');
      }
      const result = await this.collection('adv_mock_case').updateOne(idQuery, {
        $set: {
          case_enable: pickBoolean(body.enable),
          up_time: this.nowSec()
        }
      });
      return resReturn(result as unknown as PluginDoc);
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(null, mapped.errcode, mapped.errmsg);
    }
  }

  @Get('autoSync/get')
  async getAutoSync(@Req() req: FastifyRequest, @Query() query: InputMap) {
    try {
      const projectId = pickNumber(query.project_id);
      if (!projectId) {
        return resReturn(null, 408, '缺少项目Id');
      }
      const token = pickString(query.token);
      await this.assertProjectReadableWithSession(req, projectId, token);
      const doc = await this.collection('interface_auto_sync').findOne({ project_id: projectId });
      return resReturn((doc || null) as PluginDoc | null);
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(null, mapped.errcode, mapped.errmsg);
    }
  }

  @Post('autoSync/save')
  async saveAutoSync(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      const projectId = pickNumber(body.project_id);
      if (!projectId) {
        return resReturn(null, 408, '缺少项目Id');
      }
      const token = pickString(body.token);
      const user = await this.assertProjectEditableWithSession(req, projectId, token);
      const payload: PluginDoc = {
        project_id: projectId,
        uid: user?._id || 0,
        is_sync_open: pickBoolean(body.is_sync_open),
        sync_mode: pickString(body.sync_mode) || 'normal',
        sync_json_url: pickString(body.sync_json_url) || '',
        sync_cron: pickString(body.sync_cron) || '',
        up_time: this.nowSec()
      };
      const idQuery = this.toIdQuery(body.id);
      if (idQuery) {
        const result = await this.collection('interface_auto_sync').updateOne(idQuery, { $set: payload });
        return resReturn(result as unknown as PluginDoc);
      }
      const result = await this.collection('interface_auto_sync').insertOne({
        ...payload,
        add_time: this.nowSec()
      });
      return resReturn({ ...payload, _id: result.insertedId });
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(null, mapped.errcode, mapped.errmsg);
    }
  }

  @Get('wiki_desc/get')
  async getWikiDesc(@Req() req: FastifyRequest, @Query() query: InputMap) {
    try {
      const projectId = pickNumber(query.project_id);
      if (!projectId) {
        return resReturn(null, 400, '项目id不能为空');
      }
      const token = pickString(query.token);
      await this.assertProjectReadableWithSession(req, projectId, token);
      const doc = await this.collection('wiki').findOne({ project_id: projectId });
      return resReturn((doc || null) as PluginDoc | null);
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(null, mapped.errcode, mapped.errmsg);
    }
  }

  @Post('wiki_desc/up')
  async upWikiDesc(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      const projectId = pickNumber(body.project_id);
      if (!projectId) {
        return resReturn(null, 400, '项目id不能为空');
      }
      const token = pickString(body.token);
      const user = await this.assertProjectEditableWithSession(req, projectId, token);
      const now = this.nowSec();
      const wikiCol = this.collection('wiki');
      const exists = await wikiCol.findOne({ project_id: projectId });
      const payload: PluginDoc = {
        project_id: projectId,
        uid: user?._id || 0,
        username: user?.username || 'token',
        desc: pickString(body.desc) || '',
        markdown: pickString(body.markdown) || pickString(body.desc) || '',
        up_time: now
      };
      if (exists) {
        const idQuery = this.toIdQuery(exists._id);
        if (idQuery) {
          const result = await wikiCol.updateOne(idQuery, { $set: payload });
          return resReturn(result as unknown as PluginDoc);
        }
      }
      const result = await wikiCol.insertOne({
        ...payload,
        add_time: now,
        edit_uid: 0
      });
      return resReturn({ ...payload, _id: result.insertedId, add_time: now, edit_uid: 0 });
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(null, mapped.errcode, mapped.errmsg);
    }
  }

  private normalizeStatus(source: string | undefined): 'all' | 'open' {
    return source === 'open' ? 'open' : 'all';
  }

  private normalizeExportType(type: string | undefined): 'openapi3' | 'swagger2' {
    if (!type || type === 'OpenAPIV2') return 'swagger2';
    if (type === 'OpenAPIV3') return 'openapi3';
    throw new Error('type 无效参数');
  }

  private collection(name: string) {
    return this.connection.collection<PluginDoc>(name);
  }

  private nowSec(): number {
    return Math.floor(Date.now() / 1000);
  }

  private formatBytes(bytes: number): string {
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }

  private formatUptime(seconds: number): string {
    const day = Math.floor(seconds / 86400);
    const hour = Math.floor((seconds % 86400) / 3600);
    const minute = Math.floor((seconds % 3600) / 60);
    return `${day}天${hour}小时${minute}分`;
  }

  private lastDaysRange(days: number): [string, string] {
    const end = new Date();
    const start = new Date(end.getTime() - days * 24 * 3600 * 1000);
    const toDate = (value: Date) => value.toISOString().slice(0, 10);
    return [toDate(start), toDate(end)];
  }

  private toIdQuery(value: unknown): PluginDoc | null {
    const num = pickNumber(value);
    if (num && Number.isFinite(num)) {
      return { _id: num };
    }
    const str = pickString(value);
    if (!str) return null;
    if (Types.ObjectId.isValid(str)) {
      return { _id: new Types.ObjectId(str) };
    }
    return { _id: str };
  }

  private async assertAdmin(req: FastifyRequest): Promise<SessionUser> {
    const user = await this.sessionService.getCurrentUser(req);
    if (!user || user.role !== 'admin') {
      throw new ForbiddenException('没有权限');
    }
    return user;
  }

  private async assertLoggedIn(req: FastifyRequest): Promise<SessionUser> {
    const user = await this.sessionService.getCurrentUser(req);
    if (!user) {
      throw new ForbiddenException('请登录...');
    }
    return user;
  }

  private async assertProjectReadableWithSession(
    req: FastifyRequest,
    projectId: number,
    token?: string
  ): Promise<ProjectEntity> {
    if (token) {
      return this.projectAuthService.assertProjectReadable(projectId, token);
    }
    const user = await this.sessionService.getCurrentUser(req);
    if (!user) {
      throw new ForbiddenException('请登录...');
    }
    const project = await this.projectModel.findOne({ _id: projectId }).lean();
    if (!project) {
      throw new NotFoundException('项目不存在');
    }
    if (!this.canReadProject(project, user)) {
      throw new ForbiddenException('没有权限');
    }
    return project;
  }

  private async assertProjectEditableWithSession(
    req: FastifyRequest,
    projectId: number,
    token?: string
  ): Promise<SessionUser | null> {
    if (token) {
      await this.projectAuthService.assertProjectEditable(projectId, token);
      return await this.sessionService.getCurrentUser(req);
    }
    const user = await this.sessionService.getCurrentUser(req);
    if (!user) {
      throw new ForbiddenException('请登录...');
    }
    const project = await this.projectModel.findOne({ _id: projectId }).lean();
    if (!project) {
      throw new NotFoundException('项目不存在');
    }
    if (!this.canEditProject(project, user)) {
      throw new ForbiddenException('没有权限');
    }
    return user;
  }

  private canReadProject(project: ProjectEntity, user: SessionUser): boolean {
    if (!project) return false;
    if (user.role === 'admin') return true;
    if (Number(project.uid || 0) === user._id) return true;
    if (project.project_type === 'public') return true;
    const members = Array.isArray((project as unknown as PluginDoc).members)
      ? ((project as unknown as PluginDoc).members as PluginDoc[])
      : [];
    return members.some(item => Number(item.uid || 0) === user._id);
  }

  private canEditProject(project: ProjectEntity, user: SessionUser): boolean {
    if (!project) return false;
    if (user.role === 'admin') return true;
    if (Number(project.uid || 0) === user._id) return true;
    const members = Array.isArray((project as unknown as PluginDoc).members)
      ? ((project as unknown as PluginDoc).members as PluginDoc[])
      : [];
    return members.some(item => {
      if (Number(item.uid || 0) !== user._id) return false;
      const role = String(item.role || '');
      return role === 'owner' || role === 'dev';
    });
  }

  private async buildLegacyExportData(
    projectId: number,
    status: 'all' | 'open',
    options: { withWiki?: boolean; fullPath?: boolean } = {}
  ): Promise<{
    project: ProjectEntity;
    list: Array<Record<string, unknown>>;
    wikiMarkdown: string;
  }> {
    const project = await this.projectModel.findOne({ _id: projectId }).lean();
    if (!project) {
      throw new NotFoundException('项目不存在');
    }
    const interfaceFilter: Record<string, unknown> = { project_id: projectId };
    if (status === 'open') {
      interfaceFilter.api_opened = true;
    }

    const [cats, interfaces, wikiDoc] = await Promise.all([
      this.interfaceCatModel.find({ project_id: projectId }).sort({ index: 1, _id: 1 }).lean(),
      this.interfaceModel.find(interfaceFilter).sort({ catid: 1, index: 1, _id: 1 }).lean(),
      options.withWiki ? this.collection('wiki').findOne({ project_id: projectId }) : null
    ]);

    const bucket = new Map<number, Array<Record<string, unknown>>>();
    interfaces.forEach(item => {
      const catid = Number(item.catid || 0);
      if (!bucket.has(catid)) {
        bucket.set(catid, []);
      }
      bucket.get(catid)!.push(JSON.parse(JSON.stringify(item)) as Record<string, unknown>);
    });

    const list = cats
      .map(cat => {
        const catid = Number(cat._id || 0);
        const entries = bucket.get(catid) || [];
        if (entries.length === 0) return null;
        const row = JSON.parse(JSON.stringify(cat)) as Record<string, unknown>;
        row.list = entries;
        return row;
      })
      .filter(Boolean) as Array<Record<string, unknown>>;

    const normalized = this.normalizeLegacyExportList(list, project, options.fullPath === true);
    const wikiMarkdown = wikiDoc ? String((wikiDoc as PluginDoc).markdown || (wikiDoc as PluginDoc).desc || '') : '';
    return { project, list: normalized, wikiMarkdown };
  }

  private normalizeLegacyExportList(
    list: Array<Record<string, unknown>>,
    project: ProjectEntity,
    fullPath: boolean
  ) {
    const basepath = String(project.basepath || '').trim();
    const joinPath = (left: string, right: string): string => {
      const merged = `${left || ''}/${right || ''}`.replace(/\/{2,}/g, '/');
      return merged.startsWith('/') ? merged : `/${merged}`;
    };

    const removeCommon = (item: Record<string, unknown>) => {
      delete item._id;
      delete item.__v;
      delete item.uid;
      delete item.edit_uid;
      delete item.project_id;
      delete item.catid;
    };

    return list.map(cate => {
      const nextCate = JSON.parse(JSON.stringify(cate)) as Record<string, unknown>;
      removeCommon(nextCate);
      if (fullPath && basepath) {
        nextCate.proBasepath = basepath;
        nextCate.proName = project.name;
        nextCate.proDescription = project.desc || '';
      }
      const rows = Array.isArray(nextCate.list) ? (nextCate.list as Array<Record<string, unknown>>) : [];
      nextCate.list = rows.map(api => {
        const nextApi = JSON.parse(JSON.stringify(api)) as Record<string, unknown>;
        removeCommon(nextApi);
        if (Array.isArray(nextApi.req_body_form)) {
          (nextApi.req_body_form as Array<Record<string, unknown>>).forEach(removeCommon);
        }
        if (Array.isArray(nextApi.req_params)) {
          (nextApi.req_params as Array<Record<string, unknown>>).forEach(removeCommon);
        }
        if (Array.isArray(nextApi.req_query)) {
          (nextApi.req_query as Array<Record<string, unknown>>).forEach(removeCommon);
        }
        if (Array.isArray(nextApi.req_headers)) {
          (nextApi.req_headers as Array<Record<string, unknown>>).forEach(removeCommon);
        }
        if (fullPath && basepath) {
          const rawPath = String(nextApi.path || '');
          const mergedPath = joinPath(basepath, rawPath);
          nextApi.path = mergedPath;
          if (nextApi.query_path && typeof nextApi.query_path === 'object') {
            (nextApi.query_path as Record<string, unknown>).path = mergedPath;
          }
        }
        return nextApi;
      });
      return nextCate;
    });
  }

  private renderMarkdown(
    project: ProjectEntity,
    list: Array<Record<string, unknown>>,
    wikiMarkdown?: string
  ): string {
    const lines: string[] = [];
    lines.push(`# ${project.name || 'YApi 项目'}`);
    if (project.desc) lines.push('', String(project.desc));
    if (wikiMarkdown) lines.push('', '## Wiki', '', wikiMarkdown);

    list.forEach(cate => {
      const catName = String(cate.name || '未命名分类');
      lines.push('', `## ${catName}`);
      const rows = Array.isArray(cate.list) ? (cate.list as Array<Record<string, unknown>>) : [];
      rows.forEach(api => {
        const method = String(api.method || 'GET').toUpperCase();
        const path = String(api.path || '');
        lines.push('', `### [${method}] ${path}`);
        lines.push('', String(api.title || api.path || ''));
        if (api.desc) {
          lines.push('', String(api.desc));
        }
      });
    });
    return lines.join('\n');
  }

  private renderHtml(
    project: ProjectEntity,
    list: Array<Record<string, unknown>>,
    wikiMarkdown?: string
  ): string {
    const escapeHtml = (text: string) =>
      text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    const markdown = this.renderMarkdown(project, list, wikiMarkdown);
    return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(
      String(project.name || 'YApi')
    )}</title><style>body{font-family:Arial,sans-serif;padding:24px;line-height:1.6}pre{white-space:pre-wrap;word-break:break-word}</style></head><body><pre>${escapeHtml(
      markdown
    )}</pre></body></html>`;
  }
}
