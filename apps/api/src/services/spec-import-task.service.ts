import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import type {
  SpecFormat,
  SpecImportResult,
  SpecImportTaskDTO,
  SpecImportTaskProgress,
  SpecSource,
  SyncMode
} from '@yapi-next/shared-types';
import { SpecImportTaskEntity } from '../database/schemas/spec-import-task.schema';

export interface ImportTaskPayload {
  projectId: number;
  uid: number;
  source: SpecSource;
  format: SpecFormat;
  syncMode: SyncMode;
  dryRun: boolean;
  url?: string;
}

@Injectable()
export class SpecImportTaskService {
  constructor(
    @InjectModel(SpecImportTaskEntity.name)
    private readonly taskModel: Model<SpecImportTaskEntity>
  ) {}

  async createTask(payload: ImportTaskPayload): Promise<SpecImportTaskDTO> {
    const now = this.now();
    const taskId = randomUUID();
    const task = await this.taskModel.create({
      _id: taskId,
      project_id: payload.projectId,
      uid: payload.uid,
      status: 'queued',
      source: payload.source,
      format: payload.format,
      syncMode: payload.syncMode,
      dryRun: payload.dryRun === true,
      url: payload.url || '',
      progress: {
        stage: 'queued',
        percent: 0,
        message: '任务已创建'
      },
      result: null,
      error: null,
      add_time: now,
      up_time: now,
      start_time: 0,
      end_time: 0
    });
    return this.toTaskDTO(task.toObject() as SpecImportTaskEntity);
  }

  async runTask(
    taskId: string,
    runner: (
      updateProgress: (progress: SpecImportTaskProgress) => Promise<void>
    ) => Promise<SpecImportResult>
  ): Promise<void> {
    await this.taskModel.updateOne(
      { _id: taskId },
      {
        $set: {
          status: 'running',
          start_time: this.now(),
          up_time: this.now(),
          progress: {
            stage: 'running',
            percent: 1,
            message: '任务开始执行'
          }
        }
      }
    );

    const updateProgress = async (progress: SpecImportTaskProgress): Promise<void> => {
      const normalized = {
        stage: progress.stage || 'running',
        percent: this.normalizePercent(progress.percent),
        message: progress.message || ''
      };
      await this.taskModel.updateOne(
        { _id: taskId },
        {
          $set: {
            progress: normalized,
            up_time: this.now()
          }
        }
      );
    };

    try {
      const result = await runner(updateProgress);
      await this.taskModel.updateOne(
        { _id: taskId },
        {
          $set: {
            status: 'success',
            result: result as Record<string, unknown>,
            error: null,
            progress: {
              stage: 'done',
              percent: 100,
              message: '任务完成'
            },
            up_time: this.now(),
            end_time: this.now()
          }
        }
      );
    } catch (err: any) {
      await this.taskModel.updateOne(
        { _id: taskId },
        {
          $set: {
            status: 'failed',
            error: {
              errcode: 400,
              errmsg: err?.message || '导入任务失败'
            },
            progress: {
              stage: 'failed',
              percent: 100,
              message: err?.message || '导入任务失败'
            },
            up_time: this.now(),
            end_time: this.now()
          }
        }
      );
    }
  }

  async getTask(taskId: string, projectId: number): Promise<SpecImportTaskDTO> {
    const task = await this.taskModel.findOne({ _id: taskId, project_id: projectId }).lean();
    if (!task) {
      throw new NotFoundException('导入任务不存在');
    }
    return this.toTaskDTO(task as SpecImportTaskEntity);
  }

  async listTasks(projectId: number, limit = 20): Promise<SpecImportTaskDTO[]> {
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 20;
    const tasks = await this.taskModel
      .find({ project_id: projectId })
      .sort({ add_time: -1 })
      .limit(safeLimit)
      .lean();
    return tasks.map(item => this.toTaskDTO(item as SpecImportTaskEntity));
  }

  private now(): number {
    return Math.floor(Date.now() / 1000);
  }

  private normalizePercent(input: number): number {
    if (!Number.isFinite(input)) return 0;
    const rounded = Math.round(input);
    if (rounded < 0) return 0;
    if (rounded > 100) return 100;
    return rounded;
  }

  private toTaskDTO(task: SpecImportTaskEntity): SpecImportTaskDTO {
    const detail = this.normalizeProgress(task.progress);
    return {
      task_id: task._id,
      project_id: task.project_id,
      uid: task.uid,
      status: task.status,
      source: task.source,
      format: task.format,
      syncMode: task.syncMode,
      dryRun: task.dryRun,
      url: task.url,
      progress: detail.percent,
      stage: detail.stage,
      message: detail.message || '',
      progress_detail: detail,
      result: (task.result || null) as Record<string, unknown> | null,
      error: (task.error || null) as Record<string, unknown> | null,
      add_time: task.add_time || 0,
      up_time: task.up_time || 0,
      start_time: task.start_time || 0,
      end_time: task.end_time || 0
    };
  }

  private normalizeProgress(progress: unknown): SpecImportTaskProgress {
    const source = (progress || {}) as Partial<SpecImportTaskProgress>;
    return {
      stage: source.stage || 'queued',
      percent: this.normalizePercent(Number(source.percent || 0)),
      message: source.message || ''
    };
  }
}
