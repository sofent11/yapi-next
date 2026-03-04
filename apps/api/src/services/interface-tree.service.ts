import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import type {
  InterfaceTreeNode,
  InterfaceTreeNodeResult,
  InterfaceTreePageResult,
  LegacyInterfaceDTO
} from '@yapi-next/shared-types';
import { InterfaceEntity } from '../database/schemas/interface.schema';
import { InterfaceCatService } from './interface-cat.service';
import { InterfaceTreeCacheService } from './interface-tree-cache.service';
import { PerfMetricsService } from './perf-metrics.service';

@Injectable()
export class InterfaceTreeService {
  constructor(
    @InjectModel(InterfaceEntity.name)
    private readonly interfaceModel: Model<InterfaceEntity>,
    private readonly catService: InterfaceCatService,
    private readonly cacheService: InterfaceTreeCacheService,
    private readonly metricsService: PerfMetricsService
  ) {}

  async tree(query: {
    projectId: number;
    page?: number;
    limit?: number;
    status?: string | string[];
    tag?: string | string[];
    includeList?: boolean;
    detail?: 'full' | 'summary';
  }): Promise<InterfaceTreePageResult> {
    const startAt = Date.now();
    const cacheKey = this.cacheService.buildKey('tree', query as unknown as Record<string, unknown>);
    const cached = this.cacheService.get<InterfaceTreePageResult>(query.projectId, cacheKey);
    if (cached) {
      this.recordCacheMetric('tree', 'hit', Date.now() - startAt);
      return cached;
    }
    this.recordCacheMetric('tree', 'miss', 0);

    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 20;
    const cats = await this.catService.listByProject(query.projectId);
    const totalCount = cats.length;
    const start = (page - 1) * limit;
    const pageCats = cats.slice(start, start + limit);
    const catIds = pageCats.map(item => item._id);
    if (catIds.length === 0) {
      const output = {
        count: totalCount,
        total: Math.ceil(totalCount / limit),
        page,
        limit,
        list: []
      };
      this.cacheService.set(query.projectId, cacheKey, output);
      this.recordDurationMetric('tree', Date.now() - startAt, query.detail || 'full');
      return output;
    }

    const option = this.buildInterfaceOption({
      projectId: query.projectId,
      catIds,
      status: query.status,
      tag: query.tag
    });

    const grouped = await this.interfaceModel.aggregate([
      { $match: option },
      { $group: { _id: '$catid', count: { $sum: 1 } } }
    ]);
    const countMap = new Map<number, number>();
    grouped.forEach(item => {
      countMap.set(item._id, item.count);
    });

    const listMap = new Map<number, LegacyInterfaceDTO[]>();
    if (query.includeList) {
      const projection = this.interfaceProjection(query.detail);
      let queryBuilder = this.interfaceModel
        .find(option)
        .sort({ index: 1, title: 1 });
      if (projection) {
        queryBuilder = queryBuilder.select(projection);
      }
      const list = await queryBuilder.lean();
      list.forEach(item => {
        const key = item.catid;
        if (!listMap.has(key)) {
          listMap.set(key, []);
        }
        listMap.get(key)?.push(item as unknown as LegacyInterfaceDTO);
      });
    }

    const list = pageCats.map(cat => {
      const item: InterfaceTreeNode = {
        _id: cat._id,
        name: cat.name,
        desc: cat.desc,
        index: cat.index,
        project_id: cat.project_id,
        interface_count: countMap.get(cat._id) || 0
      };
      if (query.includeList) {
        item.list = listMap.get(cat._id) || [];
      }
      return item;
    });

    const output = {
      count: totalCount,
      total: Math.ceil(totalCount / limit),
      page,
      limit,
      list
    };
    this.cacheService.set(query.projectId, cacheKey, output);
    this.recordDurationMetric('tree', Date.now() - startAt, query.detail || 'full');
    return output;
  }

  async treeNode(query: {
    catid: number;
    page?: number;
    limit?: number;
    status?: string | string[];
    tag?: string | string[];
    detail?: 'full' | 'summary';
  }): Promise<InterfaceTreeNodeResult> {
    const startAt = Date.now();
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 50;
    const cat = await this.catService.findById(query.catid);
    if (!cat) {
      throw new NotFoundException('不存在的分类');
    }

    const cacheKey = this.cacheService.buildKey('treeNode', query as unknown as Record<string, unknown>);
    const cached = this.cacheService.get<InterfaceTreeNodeResult>(cat.project_id, cacheKey);
    if (cached) {
      this.recordCacheMetric('treeNode', 'hit', Date.now() - startAt);
      return cached;
    }
    this.recordCacheMetric('treeNode', 'miss', 0);

    const option: FilterQuery<InterfaceEntity> = { catid: query.catid };
    this.applyFilter(option, 'status', query.status);
    this.applyFilter(option, 'tag', query.tag);

    const projection = this.interfaceProjection(query.detail);
    let listQuery = this.interfaceModel
      .find(option)
      .sort({ index: 1, title: 1 })
      .skip((page - 1) * limit)
      .limit(limit);
    if (projection) {
      listQuery = listQuery.select(projection);
    }

    const [count, list] = await Promise.all([
      this.interfaceModel.countDocuments(option),
      listQuery.lean()
    ]);

    const output = {
      count,
      total: Math.ceil(count / limit),
      page,
      limit,
      list: list as unknown as LegacyInterfaceDTO[]
    };
    this.cacheService.set(cat.project_id, cacheKey, output);
    this.recordDurationMetric('treeNode', Date.now() - startAt, query.detail || 'full');
    return output;
  }

  private buildInterfaceOption(input: {
    projectId: number;
    catIds: number[];
    status?: string | string[];
    tag?: string | string[];
  }): FilterQuery<InterfaceEntity> {
    const option: FilterQuery<InterfaceEntity> = {
      project_id: input.projectId,
      catid: { $in: input.catIds }
    };
    this.applyFilter(option, 'status', input.status);
    this.applyFilter(option, 'tag', input.tag);
    return option;
  }

  async listMenu(query: {
    projectId: number;
    status?: string | string[];
    tag?: string | string[];
    detail?: 'full' | 'summary';
  }): Promise<InterfaceTreeNode[]> {
    const startAt = Date.now();
    const cacheKey = this.cacheService.buildKey('listMenu', query as unknown as Record<string, unknown>);
    const cached = this.cacheService.get<InterfaceTreeNode[]>(query.projectId, cacheKey);
    if (cached) {
      this.recordCacheMetric('listMenu', 'hit', Date.now() - startAt);
      return cached;
    }
    this.recordCacheMetric('listMenu', 'miss', 0);

    const cats = await this.catService.listByProject(query.projectId);
    const catIds = cats.map(item => item._id);
    if (catIds.length === 0) return [];

    const option = this.buildInterfaceOption({
      projectId: query.projectId,
      catIds,
      status: query.status,
      tag: query.tag
    });

    const projection = this.interfaceProjection(query.detail);
    let queryBuilder = this.interfaceModel
      .find(option)
      .sort({ catid: 1, index: 1, title: 1 });
    if (projection) {
      queryBuilder = queryBuilder.select(projection);
    }
    const interfaces = await queryBuilder.lean();
    const interfaceMap = new Map<number, LegacyInterfaceDTO[]>();
    interfaces.forEach(item => {
      const key = item.catid;
      if (!interfaceMap.has(key)) {
        interfaceMap.set(key, []);
      }
      interfaceMap.get(key)?.push(item as unknown as LegacyInterfaceDTO);
    });

    const output: InterfaceTreeNode[] = cats.map(cat => ({
      _id: cat._id,
      name: cat.name,
      desc: cat.desc,
      index: cat.index,
      project_id: cat.project_id,
      list: interfaceMap.get(cat._id) || []
    }));
    this.cacheService.set(query.projectId, cacheKey, output);
    this.recordDurationMetric('listMenu', Date.now() - startAt, query.detail || 'full');
    return output;
  }

  private applyFilter(
    option: FilterQuery<InterfaceEntity>,
    key: 'status' | 'tag',
    value?: string | string[]
  ): void {
    if (!value) return;
    if (Array.isArray(value)) {
      if (value.length > 0) {
        option[key] = { $in: value } as any;
      }
      return;
    }
    option[key] = value as any;
  }

  private interfaceProjection(detail?: 'full' | 'summary'): string | undefined {
    if (detail !== 'summary') return undefined;
    return '_id title path method catid status tag index up_time';
  }

  private recordCacheMetric(route: string, status: 'hit' | 'miss', durationMs: number): void {
    this.metricsService.incCounter('yapi_api_interface_tree_cache_total', { route, status }, 1);
    if (durationMs > 0) {
      this.metricsService.observeHistogram('yapi_api_interface_tree_cache_duration_ms', durationMs, {
        route,
        status
      });
    }
  }

  private recordDurationMetric(route: string, durationMs: number, detail: 'full' | 'summary'): void {
    this.metricsService.observeHistogram('yapi_api_interface_tree_duration_ms', durationMs, {
      route,
      detail
    });
  }
}
