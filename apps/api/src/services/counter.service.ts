import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CounterEntity } from '../database/schemas/counter.schema';

@Injectable()
export class CounterService {
  constructor(
    @InjectModel(CounterEntity.name)
    private readonly counterModel: Model<CounterEntity>
  ) {}

  async next(model: string, field = '_id', startAt = 11): Promise<number> {
    await this.ensureCounter(model, field, startAt);
    const result = await this.counterModel.findOneAndUpdate(
      { model, field },
      { $inc: { count: 1 } },
      { new: true }
    );
    if (!result) {
      throw new Error(`无法分配自增序列: ${model}.${field}`);
    }
    return result.count;
  }

  async nextMany(model: string, size: number, field = '_id', startAt = 11): Promise<number[]> {
    if (size <= 0) return [];
    await this.ensureCounter(model, field, startAt);
    const result = await this.counterModel.findOneAndUpdate(
      { model, field },
      { $inc: { count: size } },
      { new: true }
    );
    if (!result) {
      throw new Error(`无法分配自增序列: ${model}.${field}`);
    }
    const end = result.count;
    const start = end - size + 1;
    return Array.from({ length: size }, (_v, idx) => start + idx);
  }

  private async ensureCounter(model: string, field: string, startAt: number): Promise<void> {
    await this.counterModel.updateOne(
      { model, field },
      {
        $setOnInsert: {
          model,
          field,
          count: startAt - 1
        }
      },
      { upsert: true }
    );
  }
}
