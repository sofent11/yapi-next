import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ProjectEntity } from '../database/schemas/project.schema';
import { TokenEntity } from '../database/schemas/token.schema';
import { LegacyCryptoService } from './legacy-crypto.service';

@Injectable()
export class ProjectAuthService {
  constructor(
    @InjectModel(ProjectEntity.name)
    private readonly projectModel: Model<ProjectEntity>,
    @InjectModel(TokenEntity.name)
    private readonly tokenModel: Model<TokenEntity>,
    private readonly cryptoService: LegacyCryptoService
  ) {}

  async resolveProjectId(projectId: number | undefined, token: string | undefined): Promise<number> {
    let tokenProjectId: number | null = null;
    if (token) {
      const unwrapped = this.cryptoService.unwrapProjectToken(token);
      const tokenData = await this.tokenModel.findOne({ token: unwrapped.token || token }).lean();
      if (!tokenData) {
        throw new ForbiddenException('token 无效');
      }
      tokenProjectId = tokenData.project_id;
    }

    if (projectId && tokenProjectId != null && projectId !== tokenProjectId) {
      throw new ForbiddenException('token 与 project_id 不匹配');
    }

    const finalProjectId = projectId || tokenProjectId;
    if (!finalProjectId) {
      throw new ForbiddenException('project_id 或 token 不能为空');
    }
    return finalProjectId;
  }

  async assertProjectReadable(projectId: number, token?: string): Promise<ProjectEntity> {
    const project = await this.projectModel.findOne({ _id: projectId }).lean();
    if (!project) {
      throw new NotFoundException('项目不存在');
    }
    if (project.project_type === 'private') {
      const unwrapped = this.cryptoService.unwrapProjectToken(token);
      const rawToken = unwrapped.token;
      if (!rawToken) {
        throw new ForbiddenException('私有项目必须传 token');
      }
      const tokenData = await this.tokenModel
        .findOne({ token: rawToken, project_id: projectId })
        .lean();
      if (!tokenData) {
        throw new ForbiddenException('token 无效');
      }
    }
    return project;
  }

  async assertProjectEditable(projectId: number, token?: string): Promise<ProjectEntity> {
    // 第一阶段以 token 作为编辑权限校验
    return this.assertProjectReadable(projectId, token);
  }
}
