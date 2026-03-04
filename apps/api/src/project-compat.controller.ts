import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { resReturn } from './common/api-response';
import { mapError } from './common/error-response';
import { InputMap, pickArray, pickBoolean, pickNumber, pickString } from './common/request-utils';
import { LegacyCryptoService } from './services/legacy-crypto.service';
import { ProjectCompatService } from './services/project-compat.service';
import { SessionAuthService } from './services/session-auth.service';

@Controller('project')
export class ProjectCompatController {
  constructor(
    private readonly sessionService: SessionAuthService,
    private readonly projectService: ProjectCompatService,
    private readonly cryptoService: LegacyCryptoService
  ) {}

  @Get('list')
  async list(@Req() req: FastifyRequest, @Query() query: InputMap) {
    try {
      const user = await this.sessionService.getCurrentUser(req);
      if (!user) {
        return resReturn(null, 40011, '请登录...');
      }
      const groupId = pickNumber(query.group_id);
      if (!groupId) {
        return resReturn(null, 400, 'group_id不能为空');
      }
      const list = await this.projectService.list(groupId, user);
      return resReturn({ list });
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(null, mapped.errcode, mapped.errmsg);
    }
  }

  @Get('check_project_name')
  async checkProjectName(@Req() req: FastifyRequest, @Query() query: InputMap) {
    try {
      const user = await this.sessionService.getCurrentUser(req);
      if (!user) {
        return resReturn(null, 40011, '请登录...');
      }
      const name = pickString(query.name);
      const groupId = pickNumber(query.group_id) || 0;
      await this.projectService.checkProjectName(name || '', groupId);
      return resReturn({});
    } catch (err) {
      return this.mapProjectError(err);
    }
  }

  @Post('add')
  async add(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      const user = await this.sessionService.getCurrentUser(req);
      if (!user) {
        return resReturn(null, 40011, '请登录...');
      }
      const result = await this.projectService.addProject(body, user);
      return resReturn(result);
    } catch (err) {
      return this.mapProjectError(err);
    }
  }

  @Post('copy')
  async copy(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      const user = await this.sessionService.getCurrentUser(req);
      if (!user) {
        return resReturn(null, 40011, '请登录...');
      }
      const result = await this.projectService.copyProject(body, user);
      return resReturn(result);
    } catch (err) {
      return this.mapProjectError(err);
    }
  }

  @Get('get')
  async get(@Req() req: FastifyRequest, @Query() query: InputMap) {
    try {
      const projectId = pickNumber(query.id) || pickNumber(query.project_id);
      if (!projectId) {
        return resReturn(null, 400, '项目id不能为空');
      }
      const token = pickString(query.token);
      const user = await this.sessionService.getCurrentUser(req);
      const project = await this.projectService.get(projectId, {
        token,
        user
      });
      return resReturn(project);
    } catch (err) {
      const mapped = mapError(err);
      if (mapped.errcode === 403) {
        return resReturn(null, 406, mapped.errmsg || '没有权限');
      }
      if (mapped.errcode === 404) {
        return resReturn(null, 400, mapped.errmsg || '不存在的项目');
      }
      return resReturn(null, mapped.errcode, mapped.errmsg);
    }
  }

  @Get('token')
  async token(@Req() req: FastifyRequest, @Query() query: InputMap) {
    try {
      const user = await this.sessionService.getCurrentUser(req);
      if (!user) {
        return resReturn(null, 40011, '请登录...');
      }
      const projectId = pickNumber(query.project_id) || pickNumber(query.id);
      if (!projectId) {
        return resReturn(null, 400, 'project_id不能为空');
      }
      await this.projectService.assertProjectExists(projectId);
      const rawToken = await this.projectService.getOrCreateToken(projectId);
      const token = this.cryptoService.encodeProjectAccessToken(rawToken, user._id);
      return resReturn(token);
    } catch (err) {
      const mapped = mapError(err);
      if (mapped.errcode === 404) {
        return resReturn(null, 400, mapped.errmsg || '不存在的项目');
      }
      return resReturn(null, mapped.errcode, mapped.errmsg);
    }
  }

  @Get('update_token')
  async updateToken(@Req() req: FastifyRequest, @Query() query: InputMap) {
    try {
      const user = await this.sessionService.getCurrentUser(req);
      if (!user) {
        return resReturn(null, 40011, '请登录...');
      }
      const projectId = pickNumber(query.project_id) || pickNumber(query.id);
      if (!projectId) {
        return resReturn(null, 400, 'project_id不能为空');
      }
      const result = await this.projectService.rotateToken(projectId);
      return resReturn({
        ...result.result,
        token: this.cryptoService.encodeProjectAccessToken(result.token, user._id)
      });
    } catch (err) {
      const mapped = mapError(err);
      if (mapped.errcode === 404) {
        return resReturn(null, 402, mapped.errmsg || '没有查到token信息');
      }
      return resReturn(null, mapped.errcode, mapped.errmsg);
    }
  }

  @Get('get_env')
  async getEnv(@Query() query: InputMap) {
    try {
      const projectId = pickNumber(query.project_id);
      if (!projectId) {
        return resReturn(null, 405, '项目id不能为空');
      }
      const env = await this.projectService.getEnv(projectId);
      return resReturn(env);
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(null, 402, mapped.errmsg);
    }
  }

  @Post('up_env')
  async upEnv(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      const user = await this.sessionService.getCurrentUser(req);
      if (!user) {
        return resReturn(null, 40011, '请登录...');
      }
      const projectId = pickNumber(body.id);
      if (!projectId) {
        return resReturn(null, 405, '项目id不能为空');
      }
      const env = pickArray<Record<string, unknown>>(body.env);
      if (!env) {
        return resReturn(null, 405, 'env参数格式有误');
      }
      const result = await this.projectService.updateProjectEnv(projectId, env, user);
      return resReturn(result);
    } catch (err) {
      return this.mapProjectError(err);
    }
  }

  @Post('up_tag')
  async upTag(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      const user = await this.sessionService.getCurrentUser(req);
      if (!user) {
        return resReturn(null, 40011, '请登录...');
      }
      const projectId = pickNumber(body.id);
      if (!projectId) {
        return resReturn(null, 405, '项目id不能为空');
      }
      const tag = pickArray<Record<string, unknown>>(body.tag);
      if (!tag) {
        return resReturn(null, 405, 'tag参数格式有误');
      }
      const result = await this.projectService.updateProjectTag(projectId, tag, user);
      return resReturn(result);
    } catch (err) {
      return this.mapProjectError(err);
    }
  }

  @Post('up')
  async up(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      const user = await this.sessionService.getCurrentUser(req);
      if (!user) {
        return resReturn(null, 40011, '请登录...');
      }
      const projectId = pickNumber(body.id);
      if (!projectId) {
        return resReturn(null, 405, '项目id不能为空');
      }
      const result = await this.projectService.updateProject(projectId, body, user);
      return resReturn(result);
    } catch (err) {
      return this.mapProjectError(err);
    }
  }

  @Post('del')
  async del(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      const user = await this.sessionService.getCurrentUser(req);
      if (!user) {
        return resReturn(null, 40011, '请登录...');
      }
      const projectId = pickNumber(body.id);
      if (!projectId) {
        return resReturn(null, 405, '项目id不能为空');
      }
      const result = await this.projectService.delProject(projectId, user);
      return resReturn(result);
    } catch (err) {
      return this.mapProjectError(err);
    }
  }

  @Post('add_member')
  async addMember(@Req() req: FastifyRequest, @Body() body: InputMap): Promise<unknown> {
    try {
      const user = await this.sessionService.getCurrentUser(req);
      if (!user) {
        return resReturn(null, 40011, '请登录...');
      }
      const projectId = pickNumber(body.id);
      if (!projectId) {
        return resReturn(null, 400, '项目id不能为空');
      }
      const memberUids = pickArray<number>(body.member_uids);
      if (!memberUids || memberUids.length === 0) {
        return resReturn(null, 400, 'member_uids不能为空');
      }
      const result = await this.projectService.addMembers(
        projectId,
        memberUids.map(item => Number(item)),
        pickString(body.role),
        user
      );
      return resReturn(result);
    } catch (err) {
      return this.mapProjectError(err);
    }
  }

  @Post('del_member')
  async delMember(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      const user = await this.sessionService.getCurrentUser(req);
      if (!user) {
        return resReturn(null, 40011, '请登录...');
      }
      const projectId = pickNumber(body.id);
      const memberUid = pickNumber(body.member_uid);
      if (!projectId || !memberUid) {
        return resReturn(null, 400, '项目id/member_uid不能为空');
      }
      const result = await this.projectService.delMember(projectId, memberUid, user);
      return resReturn(result);
    } catch (err) {
      return this.mapProjectError(err);
    }
  }

  @Get('get_member_list')
  async getMemberList(@Req() req: FastifyRequest, @Query() query: InputMap): Promise<unknown> {
    try {
      const user = await this.sessionService.getCurrentUser(req);
      if (!user) {
        return resReturn(null, 40011, '请登录...');
      }
      const projectId = pickNumber(query.id);
      if (!projectId) {
        return resReturn(null, 400, '项目id不能为空');
      }
      const list = await this.projectService.getMemberList(projectId);
      return resReturn(list);
    } catch (err) {
      return this.mapProjectError(err);
    }
  }

  @Post('change_member_role')
  async changeMemberRole(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      const user = await this.sessionService.getCurrentUser(req);
      if (!user) {
        return resReturn(null, 40011, '请登录...');
      }
      const projectId = pickNumber(body.id);
      const memberUid = pickNumber(body.member_uid);
      if (!projectId || !memberUid) {
        return resReturn(null, 400, '项目id/member_uid不能为空');
      }
      const result = await this.projectService.changeMemberRole(
        projectId,
        memberUid,
        pickString(body.role),
        user
      );
      return resReturn(result);
    } catch (err) {
      return this.mapProjectError(err);
    }
  }

  @Post('change_member_email_notice')
  async changeMemberEmailNotice(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      const user = await this.sessionService.getCurrentUser(req);
      if (!user) {
        return resReturn(null, 40011, '请登录...');
      }
      const projectId = pickNumber(body.id);
      const memberUid = pickNumber(body.member_uid);
      if (!projectId || !memberUid) {
        return resReturn(null, 400, '项目id/member_uid不能为空');
      }
      const result = await this.projectService.changeMemberEmailNotice(
        projectId,
        memberUid,
        pickBoolean(body.notice)
      );
      return resReturn(result);
    } catch (err) {
      return this.mapProjectError(err);
    }
  }

  @Post('upset')
  async upset(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      const user = await this.sessionService.getCurrentUser(req);
      if (!user) {
        return resReturn(null, 40011, '请登录...');
      }
      const projectId = pickNumber(body.id);
      if (!projectId) {
        return resReturn(null, 405, '项目id不能为空');
      }
      const result = await this.projectService.upsetProject(
        projectId,
        {
          icon: pickString(body.icon),
          color: pickString(body.color)
        },
        user
      );
      return resReturn(result);
    } catch (err) {
      return this.mapProjectError(err);
    }
  }

  @Get('search')
  async search(@Req() req: FastifyRequest, @Query() query: InputMap) {
    try {
      const user = await this.sessionService.getCurrentUser(req);
      if (!user) {
        return resReturn(null, 40011, '请登录...');
      }
      const keyword = pickString(query.q);
      const data = await this.projectService.searchKeyword(keyword || '');
      return resReturn(data, 0, 'ok');
    } catch (err) {
      const mapped = mapError(err);
      if (mapped.errmsg === 'No keyword.' || mapped.errmsg === 'Bad query.') {
        return resReturn(null, 400, mapped.errmsg);
      }
      return resReturn(null, 402, mapped.errmsg);
    }
  }

  @Get('swagger_url')
  async swaggerUrl(@Req() req: FastifyRequest, @Query() query: InputMap) {
    try {
      const user = await this.sessionService.getCurrentUser(req);
      if (!user) {
        return resReturn(null, 40011, '请登录...');
      }
      const sourceUrl = pickString(query.url);
      if (!sourceUrl) {
        return resReturn(null, 400, 'url不能为空');
      }
      const result = await this.projectService.fetchSwaggerUrl(sourceUrl);
      return resReturn(result);
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(null, 402, mapped.errmsg);
    }
  }

  private mapProjectError(err: unknown) {
    const mapped = mapError(err);
    if (mapped.errmsg === '没有权限') {
      return resReturn(null, 405, mapped.errmsg);
    }
    if (mapped.errmsg === '项目名不能为空') {
      return resReturn(null, 401, mapped.errmsg);
    }
    if (mapped.errmsg === '已存在的项目名' || mapped.errmsg === 'basepath格式有误') {
      return resReturn(null, 401, mapped.errmsg);
    }
    if (mapped.errmsg === '项目名或分组id不能为空') {
      return resReturn(null, 405, mapped.errmsg);
    }
    if (mapped.errmsg === '环境变量名重复' || mapped.errmsg === 'env参数格式有误' || mapped.errmsg === 'tag参数格式有误') {
      return resReturn(null, 405, mapped.errmsg);
    }
    if (mapped.errmsg === '项目成员不存在') {
      return resReturn(null, 400, mapped.errmsg);
    }
    if (mapped.errmsg === '分组不存在') {
      return resReturn(null, 402, mapped.errmsg);
    }
    if (mapped.errcode === 404) {
      return resReturn(null, 402, mapped.errmsg || '不存在的项目');
    }
    return resReturn(null, 402, mapped.errmsg);
  }
}
