import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CounterDocument = HydratedDocument<CounterEntity>;

@Schema({ collection: 'identitycounters', versionKey: false })
export class CounterEntity {
  @Prop({ type: String, required: true })
  model!: string;

  @Prop({ type: String, required: true })
  field!: string;

  @Prop({ type: Number, required: true, default: 0 })
  count!: number;
}

export const CounterSchema = SchemaFactory.createForClass(CounterEntity);
CounterSchema.index({ model: 1, field: 1 }, { unique: true });
