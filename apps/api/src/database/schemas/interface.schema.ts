import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';

export type InterfaceDocument = HydratedDocument<InterfaceEntity>;

@Schema({ collection: 'interface', versionKey: false, strict: false })
export class InterfaceEntity {
  @Prop({ type: Number, required: true })
  _id!: number;

  @Prop({ type: Number, required: true })
  uid!: number;

  @Prop({ type: String, required: true })
  title!: string;

  @Prop({ type: String, required: true })
  path!: string;

  @Prop({ type: String, required: true })
  method!: string;

  @Prop({ type: Number, required: true })
  project_id!: number;

  @Prop({ type: Number, required: true })
  catid!: number;

  @Prop({ type: String, default: 'undone' })
  status!: string;

  @Prop({ type: String, default: 'static' })
  type!: string;

  @Prop({ type: Number, default: 0 })
  index!: number;

  @Prop({ type: Boolean, default: false })
  api_opened!: boolean;

  @Prop({ type: Number, default: 0 })
  add_time!: number;

  @Prop({ type: Number, default: 0 })
  up_time!: number;

  @Prop({ type: SchemaTypes.Mixed, default: [] })
  req_query!: Array<Record<string, unknown>>;

  @Prop({ type: SchemaTypes.Mixed, default: [] })
  req_headers!: Array<Record<string, unknown>>;

  @Prop({ type: SchemaTypes.Mixed, default: [] })
  req_params!: Array<Record<string, unknown>>;

  @Prop({ type: String, default: 'raw' })
  req_body_type!: string;

  @Prop({ type: Boolean, default: false })
  req_body_is_json_schema!: boolean;

  @Prop({ type: SchemaTypes.Mixed, default: [] })
  req_body_form!: Array<Record<string, unknown>>;

  @Prop({ type: String, default: '' })
  req_body_other!: string;

  @Prop({ type: String, default: 'raw' })
  res_body_type!: string;

  @Prop({ type: String, default: '' })
  res_body!: string;

  @Prop({ type: Boolean, default: false })
  res_body_is_json_schema!: boolean;

  @Prop({ type: SchemaTypes.Mixed, default: {} })
  query_path!: {
    path: string;
    params: Array<{ name: string; value: string }>;
  };

  @Prop({ type: String, default: '' })
  operation_oas3!: string;

  @Prop({ type: String, default: '' })
  import_meta!: string;

  @Prop({ type: [String], default: [] })
  tag!: string[];

  @Prop({ type: String, default: '' })
  desc!: string;

  @Prop({ type: String, default: '' })
  markdown!: string;
}

export const InterfaceSchema = SchemaFactory.createForClass(InterfaceEntity);
InterfaceSchema.index({ project_id: 1, path: 1, method: 1 }, { unique: true });
InterfaceSchema.index({ project_id: 1, catid: 1, index: 1 });
InterfaceSchema.index({ project_id: 1, type: 1, method: 1 });
InterfaceSchema.index({ project_id: 1, status: 1, tag: 1, index: 1 });
InterfaceSchema.index({ 'query_path.path': 1, project_id: 1, method: 1 });
