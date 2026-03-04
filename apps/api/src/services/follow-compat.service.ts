import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FollowEntity } from '../database/schemas/follow.schema';
import { ProjectEntity } from '../database/schemas/project.schema';
import { ProjectCompatService } from './project-compat.service';
import { SessionUser } from './session-auth.service';

@Injectable()
export class FollowCompatService {
  constructor(
    @InjectModel(FollowEntity.name)
    private readonly followModel: Model<FollowEntity>,
    @InjectModel(ProjectEntity.name)
    private readonly projectModel: Model<ProjectEntity>,
    private readonly projectService: ProjectCompatService
  ) {}

  async list(uid: number): Promise<Array<Record<string, unknown>>> {
    const rows = await this.followModel.find({ uid }).sort({ _id: -1 }).lean();
    return rows.map(item => ({
      _id: item._id,
      uid: item.uid,
      projectid: item.projectid,
      projectname: item.projectname,
      icon: item.icon || '',
      color: item.color || ''
    }));
  }

  async add(projectId: number, user: SessionUser): Promise<Record<string, unknown>> {
    if (!projectId) {
      throw new Error('项目id不能为空');
    }
    await this.projectService.assertProjectPermission(projectId, 'view', { user });
    const project = await this.projectModel.findOne({ _id: projectId }).lean();
    if (!project) {
      throw new NotFoundException('不存在的项目');
    }

    const repeat = await this.followModel.countDocuments({ uid: user._id, projectid: projectId });
    if (repeat > 0) {
      throw new Error('项目已关注');
    }

    const result = await this.followModel.create({
      uid: user._id,
      projectid: projectId,
      projectname: project.name || '',
      icon: project.icon || '',
      color: project.color || ''
    });

    return {
      _id: result._id,
      uid: result.uid,
      projectid: result.projectid,
      projectname: result.projectname,
      icon: result.icon || '',
      color: result.color || ''
    };
  }

  async del(projectId: number, uid: number): Promise<Record<string, unknown>> {
    if (!projectId) {
      throw new Error('项目id不能为空');
    }
    const repeat = await this.followModel.countDocuments({ uid, projectid: projectId });
    if (repeat === 0) {
      throw new Error('项目未关注');
    }
    const result = await this.followModel.deleteOne({ uid, projectid: projectId });
    return {
      acknowledged: result.acknowledged,
      deletedCount: result.deletedCount || 0
    };
  }
}
