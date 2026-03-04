import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { resReturn } from './common/api-response';
import { mapError } from './common/error-response';
import { InputMap, pickNumber } from './common/request-utils';
import { FollowCompatService } from './services/follow-compat.service';
import { SessionAuthService } from './services/session-auth.service';

@Controller('follow')
export class FollowCompatController {
  constructor(
    private readonly sessionService: SessionAuthService,
    private readonly followService: FollowCompatService
  ) {}

  @Get('list')
  async list(@Req() req: FastifyRequest) {
    try {
      const user = await this.sessionService.getCurrentUser(req);
      if (!user) {
        return resReturn(null, 40011, '请登录...');
      }
      const list = await this.followService.list(user._id);
      return resReturn({ list });
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(null, mapped.errcode, mapped.errmsg);
    }
  }

  @Post('add')
  async add(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      const user = await this.sessionService.getCurrentUser(req);
      if (!user) {
        return resReturn(null, 40011, '请登录...');
      }
      const projectId = pickNumber(body.projectid);
      if (!projectId) {
        return resReturn(null, 400, '项目id不能为空');
      }
      const result = await this.followService.add(projectId, user);
      return resReturn(result);
    } catch (err) {
      return this.mapFollowError(err);
    }
  }

  @Post('del')
  async del(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      const user = await this.sessionService.getCurrentUser(req);
      if (!user) {
        return resReturn(null, 40011, '请登录...');
      }
      const projectId = pickNumber(body.projectid);
      if (!projectId) {
        return resReturn(null, 400, '项目id不能为空');
      }
      const result = await this.followService.del(projectId, user._id);
      return resReturn(result);
    } catch (err) {
      return this.mapFollowError(err);
    }
  }

  private mapFollowError(err: unknown) {
    const mapped = mapError(err);
    if (mapped.errmsg === '项目已关注' || mapped.errmsg === '项目未关注') {
      return resReturn(null, 401, mapped.errmsg);
    }
    if (mapped.errmsg === '项目id不能为空') {
      return resReturn(null, 400, mapped.errmsg);
    }
    if (mapped.errmsg === '没有权限') {
      return resReturn(null, 405, mapped.errmsg);
    }
    if (mapped.errcode === 404) {
      return resReturn(null, 402, mapped.errmsg || '不存在的项目');
    }
    return resReturn(null, 402, mapped.errmsg);
  }
}
