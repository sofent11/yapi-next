import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InterfaceEntity } from '../database/schemas/interface.schema';
import { LogEntity } from '../database/schemas/log.schema';
import { ProjectEntity } from '../database/schemas/project.schema';

type LogListInput = {
  typeid: number;
  type: string;
  page?: number;
  limit?: number;
  selectValue?: string;
};

type ApiTarget = {
  method?: string;
  path?: string;
};

@Injectable()
export class LogCompatService {
  constructor(
    @InjectModel(LogEntity.name)
    private readonly logModel: Model<LogEntity>,
    @InjectModel(ProjectEntity.name)
    private readonly projectModel: Model<ProjectEntity>,
    @InjectModel(InterfaceEntity.name)
    private readonly interfaceModel: Model<InterfaceEntity>
  ) {}

  async list(input: LogListInput): Promise<Record<string, unknown>> {
    const page = this.safePage(input.page);
    const limit = this.safeLimit(input.limit);

    if (input.type === 'group') {
      const projects = await this.projectModel.find({ group_id: input.typeid }).select('_id name').lean();
      const projectIds = projects.map(item => item._id);
      const projectMap = new Map<number, string>();
      projects.forEach(item => projectMap.set(Number(item._id), item.name || ''));

      const where = {
        $or: [
          { type: 'project', typeid: { $in: projectIds } },
          { type: 'group', typeid: input.typeid }
        ]
      };
      const [rows, count] = await Promise.all([
        this.logModel
          .find(where)
          .sort({ add_time: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        this.logModel.countDocuments(where)
      ]);

      const list = rows.map(item => {
        if (item.type !== 'project') return item;
        const projectName = projectMap.get(Number(item.typeid));
        if (!projectName) return item;
        return {
          ...item,
          content: `在 <a href="/project/${item.typeid}">${projectName}</a> 项目: ${item.content}`
        };
      });

      return {
        list,
        total: Math.ceil(count / limit)
      };
    }

    if (input.type !== 'project') {
      return { list: [], total: 0 };
    }

    const where: Record<string, unknown> = {
      type: 'project',
      typeid: input.typeid
    };
    if (input.selectValue === 'wiki') {
      where['data.type'] = 'wiki';
    } else if (this.isFiniteNumber(input.selectValue)) {
      where['data.interface_id'] = Number(input.selectValue);
    }

    const [list, count] = await Promise.all([
      this.logModel
        .find(where)
        .sort({ add_time: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.logModel.countDocuments(where)
    ]);

    return {
      total: Math.ceil(count / limit),
      list
    };
  }

  async listByUpdate(
    typeid: number,
    type: string,
    apis: ApiTarget[]
  ): Promise<Array<Record<string, unknown>>> {
    const project = await this.projectModel.findOne({ _id: typeid }).select('basepath').lean();
    const basepath = project?.basepath || '';
    const merged: Array<Record<string, unknown>> = [];

    for (const api of apis) {
      const method = String(api.method || '').toUpperCase();
      if (!method) continue;

      const originalPath = String(api.path || '');
      const path = basepath && originalPath.indexOf(basepath) === 0
        ? originalPath.slice(basepath.length)
        : originalPath;
      if (!path) continue;

      const interfaces = await this.interfaceModel
        .find({
          project_id: typeid,
          path,
          method
        })
        .select('_id')
        .lean();

      for (const item of interfaces) {
        const last = await this.logModel
          .find({
            type,
            typeid,
            'data.interface_id': Number(item._id)
          })
          .sort({ add_time: -1 })
          .limit(1)
          .select('uid content type username typeid add_time')
          .lean();
        if (last.length > 0) {
          merged.push(...(last as unknown as Array<Record<string, unknown>>));
        }
      }
    }
    return merged;
  }

  private safePage(input: number | undefined): number {
    if (!Number.isFinite(input) || !input || input < 1) return 1;
    return Math.floor(input);
  }

  private safeLimit(input: number | undefined): number {
    if (!Number.isFinite(input) || !input || input < 1) return 10;
    return Math.min(200, Math.floor(input));
  }

  private isFiniteNumber(input: string | undefined): boolean {
    if (typeof input !== 'string' || input.trim() === '') return false;
    return Number.isFinite(Number(input));
  }
}
