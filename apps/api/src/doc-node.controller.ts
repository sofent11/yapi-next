import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { resReturn } from './common/api-response';
import { mapError } from './common/error-response';
import { InputMap, pickNumber, pickString } from './common/request-utils';
import { DocNodeType, DocScopeType } from './database/schemas/doc-node.schema';
import { DocNodeService } from './services/doc-node.service';
import { SessionAuthService } from './services/session-auth.service';

@Controller('doc')
export class DocNodeController {
  constructor(
    private readonly sessionService: SessionAuthService,
    private readonly docNodeService: DocNodeService
  ) {}

  @Get('tree')
  async tree(@Req() req: FastifyRequest, @Query() query: InputMap) {
    try {
      const token = pickString(query.token);
      const user = await this.sessionService.getCurrentUser(req);
      if (!user && !token) {
        return resReturn(null, 40011, '请登录...');
      }
      const result = await this.docNodeService.tree(
        {
          scope_type: this.pickScopeType(query.scope_type),
          group_id: pickNumber(query.group_id),
          project_id: pickNumber(query.project_id),
          token
        },
        { user }
      );
      return resReturn(result);
    } catch (err) {
      return this.mapDocError(err);
    }
  }

  @Post('add')
  async add(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      const user = await this.sessionService.getCurrentUser(req);
      if (!user) {
        return resReturn(null, 40011, '请登录...');
      }
      const result = await this.docNodeService.add(
        {
          scope_type: this.pickScopeType(body.scope_type),
          group_id: pickNumber(body.group_id),
          project_id: pickNumber(body.project_id),
          parent_id: pickNumber(body.parent_id) || 0,
          node_type: this.pickNodeType(body.node_type),
          title: pickString(body.title) || '',
          markdown: typeof body.markdown === 'string' ? body.markdown : ''
        },
        user
      );
      return resReturn(result);
    } catch (err) {
      return this.mapDocError(err);
    }
  }

  @Post('up')
  async up(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      const user = await this.sessionService.getCurrentUser(req);
      if (!user) {
        return resReturn(null, 40011, '请登录...');
      }
      const id = pickNumber(body.id);
      if (!id) {
        return resReturn(null, 400, 'id不能为空');
      }
      const result = await this.docNodeService.update(
        id,
        {
          title: typeof body.title === 'string' ? body.title : undefined,
          markdown: typeof body.markdown === 'string' ? body.markdown : undefined,
          parent_id: pickNumber(body.parent_id),
          index: pickNumber(body.index)
        },
        user
      );
      return resReturn(result);
    } catch (err) {
      return this.mapDocError(err);
    }
  }

  @Post('move')
  async move(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      const user = await this.sessionService.getCurrentUser(req);
      if (!user) {
        return resReturn(null, 40011, '请登录...');
      }
      const id = pickNumber(body.id);
      if (!id) {
        return resReturn(null, 400, 'id不能为空');
      }
      const result = await this.docNodeService.move(
        id,
        pickNumber(body.parent_id) || 0,
        pickNumber(body.index),
        user
      );
      return resReturn(result);
    } catch (err) {
      return this.mapDocError(err);
    }
  }

  @Post('del')
  async del(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      const user = await this.sessionService.getCurrentUser(req);
      if (!user) {
        return resReturn(null, 40011, '请登录...');
      }
      const id = pickNumber(body.id);
      if (!id) {
        return resReturn(null, 400, 'id不能为空');
      }
      const result = await this.docNodeService.del(id, user);
      return resReturn(result);
    } catch (err) {
      return this.mapDocError(err);
    }
  }

  private pickScopeType(input: unknown): DocScopeType {
    return input === 'group' ? 'group' : 'project';
  }

  private pickNodeType(input: unknown): DocNodeType {
    return input === 'folder' ? 'folder' : 'page';
  }

  private mapDocError(err: unknown) {
    const mapped = mapError(err);
    if (mapped.errmsg === '没有权限') {
      return resReturn(null, 405, mapped.errmsg);
    }
    if (mapped.errcode === 404) {
      return resReturn(null, 404, mapped.errmsg);
    }
    return resReturn(null, mapped.errcode, mapped.errmsg);
  }
}
