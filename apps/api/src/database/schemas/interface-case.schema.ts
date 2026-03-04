import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';

export type InterfaceCaseDocument = HydratedDocument<InterfaceCaseEntity>;

@Schema({ collection: 'interface_case', versionKey: false, strict: false })
export class InterfaceCaseEntity {
  @Prop({ type: Number, required: true })
  interface_id!: number;

  @Prop({ type: Number, required: true })
  project_id!: number;

  @Prop({ type: Number, required: true })
  col_id!: number;

  @Prop({ type: Number, required: true })
  uid!: number;

  @Prop({ type: String, required: true })
  casename!: string;

  @Prop({ type: Number, default: 0 })
  index!: number;

  @Prop({ type: Number, default: 0 })
  add_time!: number;

  @Prop({ type: Number, default: 0 })
  up_time!: number;

  @Prop({ type: SchemaTypes.Mixed, default: [] })
  req_params!: Array<Record<string, unknown>>;

  @Prop({ type: SchemaTypes.Mixed, default: [] })
  req_headers!: Array<Record<string, unknown>>;

  @Prop({ type: SchemaTypes.Mixed, default: [] })
  req_query!: Array<Record<string, unknown>>;

  @Prop({ type: SchemaTypes.Mixed, default: [] })
  req_body_form!: Array<Record<string, unknown>>;

  @Prop({ type: String, default: '' })
  req_body_other!: string;
}

export const InterfaceCaseSchema = SchemaFactory.createForClass(InterfaceCaseEntity);
InterfaceCaseSchema.index({ interface_id: 1 });
InterfaceCaseSchema.index({ project_id: 1 });
