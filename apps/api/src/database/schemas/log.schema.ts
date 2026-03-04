import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';

export type LogDocument = HydratedDocument<LogEntity>;

@Schema({ collection: 'log', versionKey: false, strict: false })
export class LogEntity {
  @Prop({ type: Number, required: true })
  uid!: number;

  @Prop({ type: Number, required: true })
  typeid!: number;

  @Prop({ type: String, required: true })
  type!: 'user' | 'group' | 'interface' | 'project' | 'other' | 'interface_col';

  @Prop({ type: String, required: true })
  content!: string;

  @Prop({ type: String, required: true })
  username!: string;

  @Prop({ type: Number, default: 0 })
  add_time!: number;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  data!: Record<string, unknown> | null;
}

export const LogSchema = SchemaFactory.createForClass(LogEntity);
LogSchema.index({ type: 1, typeid: 1, add_time: -1 });
