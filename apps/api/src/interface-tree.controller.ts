import { Controller, Get, Query, Req } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import type { InterfaceTreeQuery } from '@yapi-next/shared-types';
import { resReturn } from './common/api-response';
import { mapError } from './common/error-response';
import { InputMap, pickBoolean, pickNumber, pickOneOrMany, pickString } from './common/request-utils';
import { InterfaceCatService } from './services/interface-cat.service';
import { InterfaceTreeService } from './services/interface-tree.service';
import { ProjectAuthService } from './services/project-auth.service';
import { ProjectCompatService } from './services/project-compat.service';
import { SessionAuthService } from './services/session-auth.service';

@Controller('interface')
export class InterfaceTreeController {
  constructor(
    private readonly treeService: InterfaceTreeService,
    private readonly catService: InterfaceCatService,
    private readonly projectAuthService: ProjectAuthService,
    private readonly projectCompatService: ProjectCompatService,
    private readonly sessionService: SessionAuthService
  ) {}

  @Get('list_menu')
  async listMenu(@Req() req: FastifyRequest, @Query() query: InputMap) {
    try {
      const token = pickString(query.token);
      const projectId = await this.projectAuthService.resolveProjectId(
        pickNumber(query.project_id),
        token
      );
      const user = await this.sessionService.getCurrentUser(req);
      await this.projectCompatService.assertProjectPermission(projectId, 'view', { user, token });

      const typedQuery: InterfaceTreeQuery = {
        project_id: projectId,
        status: pickOneOrMany(query.status),
        tag: pickOneOrMany(query.tag),
        detail: this.normalizeDetail(pickString(query.detail)),
        token
      };
      const result = await this.treeService.listMenu({
        projectId: typedQuery.project_id,
        status: typedQuery.status,
        tag: typedQuery.tag,
        detail: typedQuery.detail
      });
      return resReturn(result);
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(null, mapped.errcode, mapped.errmsg);
    }
  }

  @Get('tree')
  async tree(@Req() req: FastifyRequest, @Query() query: InputMap) {
    try {
      const token = pickString(query.token);
      const projectId = await this.projectAuthService.resolveProjectId(
        pickNumber(query.project_id),
        token
      );
      const user = await this.sessionService.getCurrentUser(req);
      await this.projectCompatService.assertProjectPermission(projectId, 'view', { user, token });

      const typedQuery: InterfaceTreeQuery = {
        project_id: projectId,
        page: pickNumber(query.page),
        limit: pickNumber(query.limit),
        status: pickOneOrMany(query.status),
        tag: pickOneOrMany(query.tag),
        include_list: pickBoolean(query.include_list),
        detail: this.normalizeDetail(pickString(query.detail)),
        token
      };
      const result = await this.treeService.tree({
        projectId: typedQuery.project_id,
        page: typedQuery.page,
        limit: typedQuery.limit,
        status: typedQuery.status,
        tag: typedQuery.tag,
        includeList: typedQuery.include_list,
        detail: typedQuery.detail
      });
      return resReturn(result);
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(null, mapped.errcode, mapped.errmsg);
    }
  }

  @Get('tree/node')
  async treeNode(@Req() req: FastifyRequest, @Query() query: InputMap) {
    try {
      const catid = pickNumber(query.catid);
      if (!catid) {
        return resReturn(null, 400, 'catid不能为空');
      }

      const cat = await this.catService.findById(catid);
      if (!cat) {
        return resReturn(null, 404, '不存在的分类');
      }

      const token = pickString(query.token);
      const user = await this.sessionService.getCurrentUser(req);
      await this.projectCompatService.assertProjectPermission(cat.project_id, 'view', {
        user,
        token
      });

      const result = await this.treeService.treeNode({
        catid,
        page: pickNumber(query.page),
        limit: pickNumber(query.limit),
        status: pickOneOrMany(query.status),
        tag: pickOneOrMany(query.tag),
        detail: this.normalizeDetail(pickString(query.detail))
      });
      return resReturn(result);
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(null, mapped.errcode, mapped.errmsg);
    }
  }

  private normalizeDetail(source: string | undefined): 'full' | 'summary' {
    return source === 'summary' ? 'summary' : 'full';
  }
}
