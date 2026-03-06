import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type {
  SpecExportFormat,
  SpecFormat,
  SpecImportResult,
  SpecImportTaskProgress,
  SpecSource,
  SyncMode
} from '@yapi-next/shared-types';
import { InterfaceEntity } from '../database/schemas/interface.schema';
import { ProjectEntity } from '../database/schemas/project.schema';
import { InterfaceCatService } from './interface-cat.service';
import { InterfaceBulkUpsertService } from './interface-bulk-upsert.service';
import { OpenapiParserService } from './openapi-parser.service';
import { SpecExportService } from './spec-export.service';

@Injectable()
export class SpecService {
  constructor(
    @InjectModel(ProjectEntity.name)
    private readonly projectModel: Model<ProjectEntity>,
    @InjectModel(InterfaceEntity.name)
    private readonly interfaceModel: Model<InterfaceEntity>,
    private readonly parserService: OpenapiParserService,
    private readonly catService: InterfaceCatService,
    private readonly bulkUpsertService: InterfaceBulkUpsertService,
    private readonly exportService: SpecExportService
  ) {}

  async import(params: {
    projectId: number;
    source: SpecSource;
    format: SpecFormat;
    json?: string;
    url?: string;
    syncMode: SyncMode;
    dryRun?: boolean;
    uid?: number;
    onProgress?: (progress: SpecImportTaskProgress) => Promise<void> | void;
  }): Promise<SpecImportResult> {
    await this.emitProgress(params.onProgress, {
      stage: 'prepare',
      percent: 5,
      message: '开始校验项目'
    });
    const project = await this.projectModel.findOne({ _id: params.projectId }).lean();
    if (!project) {
      throw new Error('项目不存在');
    }

    let content = params.json || '';
    if (params.source === 'url') {
      const targetUrl = params.url || params.json;
      if (!targetUrl) {
        throw new Error('url 不能为空');
      }
      const response = await axios.get(targetUrl, { timeout: 30000 });
      content = JSON.stringify(response.data);
    }
    if (!content) {
      throw new Error('json 或 url 不能为空');
    }

    await this.emitProgress(params.onProgress, {
      stage: 'parse',
      percent: 25,
      message: '正在解析规范'
    });
    const parsed = await this.parserService.parse(content);
    if (params.format !== 'auto' && params.format !== parsed.detectedFormat) {
      throw new Error(`format 与文档版本不匹配，当前检测为 ${parsed.detectedFormat}`);
    }
    const apis = parsed.apis.filter(item => !String(item.path || '').includes('/inner/'));
    const usedCatNames = new Set(
      apis
        .map(item => (typeof item.catname === 'string' ? item.catname.trim() : ''))
        .filter(Boolean)
    );
    const cats = parsed.cats.filter(item => usedCatNames.has(String(item.name || '').trim()));

    if (params.dryRun) {
      await this.emitProgress(params.onProgress, {
        stage: 'done',
        percent: 100,
        message: 'dry-run 完成'
      });
      return {
        dryRun: true,
        project_id: params.projectId,
        detectedFormat: parsed.detectedFormat,
        categories: cats.length,
        interfaces: apis.length,
        basePath: parsed.basePath || '',
        sample: apis.slice(0, 5).map(item => ({
          method: item.method,
          path: item.path,
          title: item.title
        }))
      };
    }

    const uid = typeof params.uid === 'number' ? params.uid : 999999;
    await this.emitProgress(params.onProgress, {
      stage: 'category',
      percent: 45,
      message: '正在处理分类'
    });
    const categorySeed = cats.length > 0
      ? cats
      : apis.length > 0
        ? [{ name: '默认分类', desc: '默认分类' }]
        : [];
    const existingInterfaceMap = await this.findExistingInterfaces(params.projectId, apis);
    const newInterfaceKeys = new Set(
      apis.map(item => this.lookupKey(item)).filter(key => !existingInterfaceMap.has(key))
    );
    const ensuredCategories = params.syncMode === 'sync'
      ? categorySeed.filter(cat =>
          apis.some(item => item.catname === cat.name && newInterfaceKeys.has(this.lookupKey(item)))
        )
      : categorySeed;
    const catMap = ensuredCategories.length > 0
      ? await this.catService.ensureCategories(params.projectId, ensuredCategories, uid)
      : new Map<string, number>();
    const items = apis.map(item => ({
      ...item,
      catid: existingInterfaceMap.get(this.lookupKey(item))
        || (item.catname && catMap.has(item.catname)
          ? (catMap.get(item.catname) as number)
          : this.firstCatId(catMap, item.catname))
    }));

    await this.emitProgress(params.onProgress, {
      stage: 'write',
      percent: 70,
      message: '正在批量写入接口'
    });
    const result = await this.bulkUpsertService.bulkUpsert({
      projectId: params.projectId,
      mode: params.syncMode,
      items,
      uid
    });

    await this.emitProgress(params.onProgress, {
      stage: 'project',
      percent: 90,
      message: '正在更新项目信息'
    });
    if (parsed.basePath && parsed.basePath !== (project.basepath || '')) {
      await this.projectModel.updateOne(
        { _id: params.projectId },
        { $set: { basepath: parsed.basePath, up_time: this.now() } }
      );
    }

    await this.emitProgress(params.onProgress, {
      stage: 'done',
      percent: 100,
      message: '导入完成'
    });
    return {
      ...result,
      detectedFormat: parsed.detectedFormat,
      categories: cats.length,
      interfaces: apis.length,
      basePath: parsed.basePath || ''
    };
  }

  async export(params: {
    projectId: number;
    format: SpecExportFormat;
    status: 'all' | 'open';
    catId?: number;
    interfaceId?: number;
  }): Promise<string> {
    return this.exportService.export({
      projectId: params.projectId,
      format: params.format,
      status: params.status,
      catId: params.catId,
      interfaceId: params.interfaceId
    });
  }

  private async findExistingInterfaces(projectId: number, apis: Array<{ path: string; method: string }>): Promise<Map<string, number>> {
    if (apis.length === 0) {
      return new Map<string, number>();
    }
    const deduped = Array.from(
      new Map(apis.map(item => [this.lookupKey(item), item])).values()
    );
    const existingRows = await this.interfaceModel.find({
      project_id: projectId,
      $or: deduped.map(item => ({ path: item.path, method: item.method }))
    }).select('path method catid').lean();
    return new Map(existingRows.map(item => [this.lookupKey(item), Number(item.catid || 0)]));
  }

  private lookupKey(item: { path: string; method: string }): string {
    return `${String(item.method || '').toUpperCase()} ${String(item.path || '')}`;
  }

  private firstCatId(map: Map<string, number>, catname?: string | null): number {
    const first = map.values().next();
    if (first.done || !first.value) {
      throw new Error(`分类不存在，无法导入接口${catname ? `: ${catname}` : ''}`);
    }
    return first.value;
  }

  private now(): number {
    return Math.floor(Date.now() / 1000);
  }

  private async emitProgress(
    handler: ((progress: SpecImportTaskProgress) => Promise<void> | void) | undefined,
    progress: SpecImportTaskProgress
  ): Promise<void> {
    if (!handler) return;
    await Promise.resolve(handler(progress));
  }
}
