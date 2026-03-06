import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';

export type SpecImportTaskDocument = HydratedDocument<SpecImportTaskEntity>;

@Schema({ collection: 'spec_import_task', versionKey: false, strict: false })
export class SpecImportTaskEntity {
  @Prop({ type: String, required: true })
  _id!: string;

  @Prop({ type: Number, required: true })
  project_id!: number;

  @Prop({ type: Number, default: 0 })
  uid!: number;

  @Prop({ type: String, default: 'queued' })
  status!: 'queued' | 'running' | 'success' | 'failed';

  @Prop({ type: String, default: 'json' })
  source!: 'json' | 'url';

  @Prop({ type: String, default: 'auto' })
  format!: 'auto' | 'swagger2' | 'openapi3';

  @Prop({ type: String, default: 'merge' })
  syncMode!: 'normal' | 'good' | 'merge' | 'sync';

  @Prop({ type: Boolean, default: false })
  dryRun!: boolean;

  @Prop({ type: String, default: '' })
  url!: string;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  progress!: {
    stage: string;
    percent: number;
    message?: string;
  };

  @Prop({ type: SchemaTypes.Mixed, default: null })
  result!: Record<string, unknown> | null;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  error!: {
    errcode: number;
    errmsg: string;
  } | null;

  @Prop({ type: Number, default: 0 })
  add_time!: number;

  @Prop({ type: Number, default: 0 })
  up_time!: number;

  @Prop({ type: Number, default: 0 })
  start_time!: number;

  @Prop({ type: Number, default: 0 })
  end_time!: number;
}

export const SpecImportTaskSchema = SchemaFactory.createForClass(SpecImportTaskEntity);
SpecImportTaskSchema.index({ project_id: 1, add_time: -1 });
SpecImportTaskSchema.index({ status: 1, up_time: -1 });
