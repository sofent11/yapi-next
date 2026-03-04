import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { resReturn } from './common/api-response';
import { mapError } from './common/error-response';
import { InputMap, pickArray, pickNumber, pickString } from './common/request-utils';
import { ColCompatService } from './services/col-compat.service';
import { SessionAuthService } from './services/session-auth.service';

@Controller('col')
export class ColCompatController {
  constructor(
    private readonly sessionService: SessionAuthService,
    private readonly colService: ColCompatService
  ) {}

  @Get('list')
  async list(@Req() req: FastifyRequest, @Query() query: InputMap) {
    try {
      const projectId = pickNumber(query.project_id);
      if (!projectId) {
        return resReturn(null, 400, '项目id不能为空');
      }
      const user = await this.sessionService.getCurrentUser(req);
      const token = pickString(query.token);
      const data = await this.colService.list(projectId, { user, token });
      return resReturn(data);
    } catch (err) {
      return this.mapReadError(err);
    }
  }

  @Post('add_col')
  async addCol(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      const projectId = pickNumber(body.project_id);
      const name = pickString(body.name);
      if (!projectId) {
        return resReturn(null, 400, '项目id不能为空');
      }
      if (!name) {
        return resReturn(null, 400, '名称不能为空');
      }
      const user = await this.sessionService.getCurrentUser(req);
      const token = pickString(body.token);
      if (!user && !token) {
        return resReturn(null, 40011, '请登录...');
      }
      const result = await this.colService.addCol(
        {
          project_id: projectId,
          name,
          desc: pickString(body.desc)
        },
        { user, token }
      );
      return resReturn(result);
    } catch (err) {
      return this.mapWriteError(err);
    }
  }

  @Get('case_list')
  async getCaseList(@Req() req: FastifyRequest, @Query() query: InputMap) {
    try {
      const colId = pickNumber(query.col_id);
      if (!colId) {
        return resReturn(null, 407, 'col_id不能为空');
      }
      const user = await this.sessionService.getCurrentUser(req);
      const token = pickString(query.token);
      const result = await this.colService.getCaseList(colId, { user, token });
      return resReturn(result);
    } catch (err) {
      return this.mapReadError(err);
    }
  }

  @Get('case_env_list')
  async getCaseEnvList(@Req() req: FastifyRequest, @Query() query: InputMap) {
    try {
      const colId = pickNumber(query.col_id);
      if (!colId) {
        return resReturn(null, 407, 'col_id不能为空');
      }
      const user = await this.sessionService.getCurrentUser(req);
      const token = pickString(query.token);
      const result = await this.colService.getCaseEnvList(colId, { user, token });
      return resReturn(result);
    } catch (err) {
      return this.mapReadError(err);
    }
  }

  @Get('case_list_by_var_params')
  async getCaseListByVariableParams(@Req() req: FastifyRequest, @Query() query: InputMap) {
    try {
      const colId = pickNumber(query.col_id);
      if (!colId) {
        return resReturn(null, 407, 'col_id不能为空');
      }
      const user = await this.sessionService.getCurrentUser(req);
      const token = pickString(query.token);
      const result = await this.colService.getCaseListByVariableParams(colId, { user, token });
      return resReturn(result);
    } catch (err) {
      return this.mapReadError(err);
    }
  }

  @Post('add_case')
  async addCase(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      const projectId = pickNumber(body.project_id);
      const interfaceId = pickNumber(body.interface_id);
      const colId = pickNumber(body.col_id);
      const caseName = pickString(body.casename);
      if (!projectId) {
        return resReturn(null, 400, '项目id不能为空');
      }
      if (!interfaceId) {
        return resReturn(null, 400, '接口id不能为空');
      }
      if (!colId) {
        return resReturn(null, 400, '接口集id不能为空');
      }
      if (!caseName) {
        return resReturn(null, 400, '用例名称不能为空');
      }
      const user = await this.sessionService.getCurrentUser(req);
      const token = pickString(body.token);
      if (!user && !token) {
        return resReturn(null, 40011, '请登录...');
      }
      const result = await this.colService.addCase(
        {
          casename: caseName,
          project_id: projectId,
          col_id: colId,
          interface_id: interfaceId,
          case_env: pickString(body.case_env),
          req_params: pickArray(body.req_params),
          req_headers: pickArray(body.req_headers),
          req_query: pickArray(body.req_query),
          req_body_form: pickArray(body.req_body_form),
          req_body_other: pickString(body.req_body_other),
          req_body_type: pickString(body.req_body_type),
          test_script: pickString(body.test_script)
        },
        { user, token }
      );
      return resReturn(result);
    } catch (err) {
      return this.mapWriteError(err);
    }
  }

  @Post('add_case_list')
  async addCaseList(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      const projectId = pickNumber(body.project_id);
      const colId = pickNumber(body.col_id);
      const interfaceList = pickArray<number>(body.interface_list);
      if (!Array.isArray(interfaceList)) {
        return resReturn(null, 400, 'interface_list 参数有误');
      }
      if (!projectId) {
        return resReturn(null, 400, '项目id不能为空');
      }
      if (!colId) {
        return resReturn(null, 400, '接口集id不能为空');
      }
      const user = await this.sessionService.getCurrentUser(req);
      const token = pickString(body.token);
      if (!user && !token) {
        return resReturn(null, 40011, '请登录...');
      }
      const result = await this.colService.addCaseList(
        {
          project_id: projectId,
          col_id: colId,
          interface_list: interfaceList.map(item => Number(item)).filter(item => Number.isFinite(item))
        },
        { user, token }
      );
      return resReturn(result);
    } catch (err) {
      return this.mapWriteError(err);
    }
  }

  @Post('clone_case_list')
  async cloneCaseList(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      const projectId = pickNumber(body.project_id);
      const colId = pickNumber(body.col_id);
      const newColId = pickNumber(body.new_col_id);
      if (!projectId) {
        return resReturn(null, 400, '项目id不能为空');
      }
      if (!colId) {
        return resReturn(null, 400, '被克隆的接口集id不能为空');
      }
      if (!newColId) {
        return resReturn(null, 400, '克隆的接口集id不能为空');
      }
      const user = await this.sessionService.getCurrentUser(req);
      const token = pickString(body.token);
      if (!user && !token) {
        return resReturn(null, 40011, '请登录...');
      }
      const result = await this.colService.cloneCaseList(
        {
          project_id: projectId,
          col_id: colId,
          new_col_id: newColId
        },
        { user, token }
      );
      return resReturn(result);
    } catch (err) {
      return this.mapWriteError(err);
    }
  }

  @Post('up_case')
  async upCase(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      const id = pickString(body.id) || (typeof body.id === 'number' ? String(body.id) : '');
      if (!id) {
        return resReturn(null, 400, '用例id不能为空');
      }
      const user = await this.sessionService.getCurrentUser(req);
      const token = pickString(body.token);
      if (!user && !token) {
        return resReturn(null, 40011, '请登录...');
      }
      const result = await this.colService.upCase(id, body, { user, token });
      return resReturn(result);
    } catch (err) {
      return this.mapWriteError(err);
    }
  }

  @Get('case')
  async getCase(@Req() req: FastifyRequest, @Query() query: InputMap) {
    try {
      const caseId = pickString(query.caseid) || (typeof query.caseid === 'number' ? String(query.caseid) : '');
      if (!caseId) {
        return resReturn(null, 400, 'caseid不能为空');
      }
      const user = await this.sessionService.getCurrentUser(req);
      const token = pickString(query.token);
      const result = await this.colService.getCase(caseId, { user, token });
      return resReturn(result);
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(null, 400, mapped.errmsg);
    }
  }

  @Post('up_col')
  async upCol(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      const colId = pickNumber(body.col_id);
      if (!colId) {
        return resReturn(null, 400, '缺少 col_id 参数');
      }
      const user = await this.sessionService.getCurrentUser(req);
      const token = pickString(body.token);
      if (!user && !token) {
        return resReturn(null, 40011, '请登录...');
      }
      const result = await this.colService.upCol(colId, body, { user, token });
      return resReturn(result);
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(null, 400, mapped.errmsg);
    }
  }

  @Post('up_case_index')
  async upCaseIndex(@Req() req: FastifyRequest, @Body() body: unknown) {
    const user = await this.sessionService.getCurrentUser(req);
    if (!user) {
      return resReturn(null, 40011, '请登录...');
    }
    if (!Array.isArray(body)) {
      return resReturn(null, 400, '请求参数必须是数组');
    }
    const input = body.map(item => (item && typeof item === 'object' ? (item as Record<string, unknown>) : {}));
    await this.colService.upCaseIndex(
      input.map(item => ({
        id: pickString(item.id) || (typeof item.id === 'number' ? String(item.id) : undefined),
        index: pickNumber(item.index)
      }))
    );
    return resReturn('成功！');
  }

  @Post('up_col_index')
  async upColIndex(@Req() req: FastifyRequest, @Body() body: unknown) {
    const user = await this.sessionService.getCurrentUser(req);
    if (!user) {
      return resReturn(null, 40011, '请登录...');
    }
    if (!Array.isArray(body)) {
      return resReturn(null, 400, '请求参数必须是数组');
    }
    const input = body.map(item => (item && typeof item === 'object' ? (item as Record<string, unknown>) : {}));
    await this.colService.upColIndex(
      input.map(item => ({
        id: pickNumber(item.id),
        index: pickNumber(item.index)
      }))
    );
    return resReturn('成功！');
  }

  @Get('del_col')
  async delCol(@Req() req: FastifyRequest, @Query() query: InputMap) {
    try {
      const colId = pickNumber(query.col_id);
      if (!colId) {
        return resReturn(null, 400, '缺少 col_id 参数');
      }
      const user = await this.sessionService.getCurrentUser(req);
      const token = pickString(query.token);
      if (!user && !token) {
        return resReturn(null, 40011, '请登录...');
      }
      const result = await this.colService.delCol(colId, { user, token });
      return resReturn(result);
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(null, 400, mapped.errmsg);
    }
  }

  @Get('del_case')
  async delCase(@Req() req: FastifyRequest, @Query() query: InputMap) {
    try {
      const caseId = pickString(query.caseid) || (typeof query.caseid === 'number' ? String(query.caseid) : '');
      if (!caseId) {
        return resReturn(null, 400, 'caseid不能为空');
      }
      const user = await this.sessionService.getCurrentUser(req);
      const token = pickString(query.token);
      if (!user && !token) {
        return resReturn(null, 40011, '请登录...');
      }
      const result = await this.colService.delCase(caseId, { user, token });
      return resReturn(result);
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(null, 400, mapped.errmsg);
    }
  }

  @Post('run_script')
  async runScript(@Req() req: FastifyRequest, @Body() body: InputMap) {
    try {
      const user = await this.sessionService.getCurrentUser(req);
      const token = pickString(body.token);
      if (!user && !token) {
        return resReturn(null, 40011, '请登录...');
      }
      return await this.colService.runCaseScript(body, { user, token });
    } catch (err) {
      const mapped = mapError(err);
      if (mapped.errmsg === '没有权限') {
        return resReturn(null, 406, mapped.errmsg);
      }
      return resReturn(null, 400, mapped.errmsg);
    }
  }

  private mapReadError(err: unknown) {
    const mapped = mapError(err);
    if (mapped.errmsg === '没有权限') {
      return resReturn(null, 406, mapped.errmsg);
    }
    if (mapped.errmsg === 'col_id不能为空') {
      return resReturn(null, 407, mapped.errmsg);
    }
    return resReturn(null, 402, mapped.errmsg);
  }

  private mapWriteError(err: unknown) {
    const mapped = mapError(err);
    if (mapped.errmsg === '没有权限') {
      return resReturn(null, 400, mapped.errmsg);
    }
    if (mapped.errmsg === '项目id不能为空' || mapped.errmsg === '接口集id不能为空') {
      return resReturn(null, 400, mapped.errmsg);
    }
    if (mapped.errcode === 404) {
      return resReturn(null, 400, mapped.errmsg);
    }
    return resReturn(null, 402, mapped.errmsg);
  }
}
