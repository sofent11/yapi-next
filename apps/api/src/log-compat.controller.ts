import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { resReturn } from './common/api-response';
import { mapError } from './common/error-response';
import { InputMap, pickArray, pickNumber, pickString } from './common/request-utils';
import { LogCompatService } from './services/log-compat.service';
import { SessionAuthService } from './services/session-auth.service';

@Controller('log')
export class LogCompatController {
  constructor(
    private readonly sessionService: SessionAuthService,
    private readonly logService: LogCompatService
  ) {}

  @Get('list')
  async list(@Req() req: FastifyRequest, @Query() query: InputMap) {
    try {
      const user = await this.sessionService.getCurrentUser(req);
      if (!user) {
        return resReturn(null, 40011, '请登录...');
      }

      const typeid = pickNumber(query.typeid);
      const type = pickString(query.type);
      if (!typeid) {
        return resReturn(null, 400, 'typeid不能为空');
      }
      if (!type) {
        return resReturn(null, 400, 'type不能为空');
      }

      const result = await this.logService.list({
        typeid,
        type,
        page: pickNumber(query.page),
        limit: pickNumber(query.limit),
        selectValue: pickString(query.selectValue)
      });
      return resReturn(result);
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(null, 402, mapped.errmsg);
    }
  }

  @Post('list_by_update')
  async listByUpdate(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      const user = await this.sessionService.getCurrentUser(req);
      if (!user) {
        return resReturn(null, 40011, '请登录...');
      }

      const typeid = pickNumber(body.typeid);
      const type = pickString(body.type);
      const apis = pickArray<Record<string, unknown>>(body.apis) || [];
      if (!typeid) {
        return resReturn(null, 400, 'typeid不能为空');
      }
      if (!type) {
        return resReturn(null, 400, 'type不能为空');
      }

      const result = await this.logService.listByUpdate(
        typeid,
        type,
        apis.map(item => ({
          method: pickString(item.method),
          path: pickString(item.path)
        }))
      );
      return resReturn(result);
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(null, 402, mapped.errmsg);
    }
  }
}
