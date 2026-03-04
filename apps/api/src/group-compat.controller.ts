import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { resReturn } from './common/api-response';
import { mapError } from './common/error-response';
import { InputMap, pickArray, pickNumber, pickString } from './common/request-utils';
import { GroupCompatService } from './services/group-compat.service';
import { SessionAuthService } from './services/session-auth.service';

@Controller('group')
export class GroupCompatController {
  constructor(
    private readonly sessionService: SessionAuthService,
    private readonly groupService: GroupCompatService
  ) {}

  @Get('list')
  async list(@Req() req: FastifyRequest) {
    try {
      const user = await this.sessionService.getCurrentUser(req);
      if (!user) return resReturn(null, 40011, '请登录...');
      const groups = await this.groupService.list(user);
      return resReturn(groups);
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(null, mapped.errcode, mapped.errmsg);
    }
  }

  @Get('get_mygroup')
  async getMyGroup(@Req() req: FastifyRequest) {
    try {
      const user = await this.sessionService.getCurrentUser(req);
      if (!user) return resReturn(null, 40011, '请登录...');
      const group = await this.groupService.getMyGroup(user);
      return resReturn(group);
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(null, mapped.errcode, mapped.errmsg);
    }
  }

  @Get('get')
  async get(@Req() req: FastifyRequest, @Query() query: InputMap) {
    try {
      const user = await this.sessionService.getCurrentUser(req);
      if (!user) return resReturn(null, 40011, '请登录...');
      const groupId = pickNumber(query.id);
      if (!groupId) return resReturn(null, 400, 'id不能为空');
      const group = await this.groupService.get(groupId, user);
      return resReturn(group);
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(null, mapped.errcode, mapped.errmsg);
    }
  }

  @Post('add')
  async add(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      const user = await this.sessionService.getCurrentUser(req);
      if (!user) return resReturn(null, 40011, '请登录...');
      const groupName = pickString(body.group_name);
      if (!groupName) return resReturn(null, 400, 'group_name不能为空');
      const result = await this.groupService.addGroup(
        {
          group_name: groupName,
          group_desc: pickString(body.group_desc),
          owner_uids: pickArray<number>(body.owner_uids)
        },
        user
      );
      return resReturn(result);
    } catch (err) {
      return this.mapWriteError(err);
    }
  }

  @Post('up')
  async up(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      const user = await this.sessionService.getCurrentUser(req);
      if (!user) return resReturn(null, 40011, '请登录...');
      const groupId = pickNumber(body.id);
      if (!groupId) return resReturn(null, 400, 'id不能为空');
      const result = await this.groupService.upGroup(
        groupId,
        {
          group_name: pickString(body.group_name),
          group_desc: pickString(body.group_desc),
          custom_field1:
            body.custom_field1 && typeof body.custom_field1 === 'object'
              ? (body.custom_field1 as { name?: string; enable?: boolean })
              : undefined
        },
        user
      );
      return resReturn(result);
    } catch (err) {
      return this.mapWriteError(err);
    }
  }

  @Post('del')
  async del(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      const user = await this.sessionService.getCurrentUser(req);
      if (!user) return resReturn(null, 40011, '请登录...');
      const groupId = pickNumber(body.id);
      if (!groupId) return resReturn(null, 400, 'id不能为空');
      const result = await this.groupService.delGroup(groupId, user);
      return resReturn(result);
    } catch (err) {
      const mapped = mapError(err);
      if (mapped.errmsg === '没有权限') {
        return resReturn(null, 401, mapped.errmsg);
      }
      if (mapped.errcode === 404) {
        return resReturn(null, 402, mapped.errmsg);
      }
      return resReturn(null, 402, mapped.errmsg);
    }
  }

  @Post('add_member')
  async addMember(@Req() req: FastifyRequest, @Body() body: InputMap): Promise<unknown> {
    try {
      const user = await this.sessionService.getCurrentUser(req);
      if (!user) return resReturn(null, 40011, '请登录...');
      const groupId = pickNumber(body.id);
      if (!groupId) return resReturn(null, 400, 'id不能为空');
      const memberUids = pickArray<number>(body.member_uids);
      if (!memberUids || memberUids.length === 0) {
        return resReturn(null, 400, 'member_uids不能为空');
      }
      const result = await this.groupService.addMembers(
        groupId,
        memberUids.map(item => Number(item)),
        pickString(body.role),
        user
      );
      return resReturn(result);
    } catch (err) {
      return this.mapWriteError(err);
    }
  }

  @Post('change_member_role')
  async changeMemberRole(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      const user = await this.sessionService.getCurrentUser(req);
      if (!user) return resReturn(null, 40011, '请登录...');
      const groupId = pickNumber(body.id);
      const memberUid = pickNumber(body.member_uid);
      if (!groupId || !memberUid) {
        return resReturn(null, 400, 'id/member_uid不能为空');
      }
      const result = await this.groupService.changeMemberRole(
        groupId,
        memberUid,
        pickString(body.role),
        user
      );
      return resReturn(result);
    } catch (err) {
      return this.mapWriteError(err);
    }
  }

  @Get('get_member_list')
  async getMemberList(@Req() req: FastifyRequest, @Query() query: InputMap): Promise<unknown> {
    try {
      const user = await this.sessionService.getCurrentUser(req);
      if (!user) return resReturn(null, 40011, '请登录...');
      const groupId = pickNumber(query.id);
      if (!groupId) return resReturn(null, 400, 'id不能为空');
      const list = await this.groupService.getMemberList(groupId);
      return resReturn(list);
    } catch (err) {
      return this.mapWriteError(err);
    }
  }

  @Post('del_member')
  async delMember(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      const user = await this.sessionService.getCurrentUser(req);
      if (!user) return resReturn(null, 40011, '请登录...');
      const groupId = pickNumber(body.id);
      const memberUid = pickNumber(body.member_uid);
      if (!groupId || !memberUid) {
        return resReturn(null, 400, 'id/member_uid不能为空');
      }
      const result = await this.groupService.delMember(groupId, memberUid, user);
      return resReturn(result);
    } catch (err) {
      return this.mapWriteError(err);
    }
  }

  private mapWriteError(err: unknown) {
    const mapped = mapError(err);
    if (mapped.errmsg === '项目分组名已存在') {
      return resReturn(null, 401, mapped.errmsg);
    }
    if (mapped.errmsg === '没有权限') {
      return resReturn(null, 405, mapped.errmsg);
    }
    if (mapped.errmsg === '分组成员不存在') {
      return resReturn(null, 400, mapped.errmsg);
    }
    if (mapped.errcode === 404) {
      return resReturn(null, 402, mapped.errmsg);
    }
    return resReturn(null, 402, mapped.errmsg);
  }
}
