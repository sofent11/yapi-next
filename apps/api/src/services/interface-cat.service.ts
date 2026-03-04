import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InterfaceCatEntity } from '../database/schemas/interface-cat.schema';
import { CounterService } from './counter.service';
import { InterfaceTreeCacheService } from './interface-tree-cache.service';

@Injectable()
export class InterfaceCatService {
  constructor(
    @InjectModel(InterfaceCatEntity.name)
    private readonly catModel: Model<InterfaceCatEntity>,
    private readonly counterService: CounterService,
    private readonly cacheService: InterfaceTreeCacheService
  ) {}

  async ensureCategories(
    projectId: number,
    categories: Array<{ name: string; desc: string }>,
    uid: number
  ): Promise<Map<string, number>> {
    let changed = false;
    const existed = await this.catModel.find({ project_id: projectId }).lean();
    const map = new Map<string, number>();
    for (const item of existed) {
      map.set(item.name, item._id);
    }

    for (const category of categories) {
      if (map.has(category.name)) continue;
      const id = await this.counterService.next('interface_cat', '_id', 11);
      await this.catModel.create({
        _id: id,
        project_id: projectId,
        uid,
        name: category.name,
        desc: category.desc || category.name,
        add_time: this.now(),
        up_time: this.now()
      });
      map.set(category.name, id);
      changed = true;
    }

    if (changed) {
      this.cacheService.invalidateProject(projectId);
    }
    return map;
  }

  async listByProject(projectId: number): Promise<InterfaceCatEntity[]> {
    return this.catModel
      .find({ project_id: projectId })
      .sort({ index: 1, _id: 1 })
      .lean();
  }

  async findById(catid: number): Promise<InterfaceCatEntity | null> {
    return this.catModel.findOne({ _id: catid }).lean();
  }

  private now(): number {
    return Math.floor(Date.now() / 1000);
  }
}
