import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';

export type InterfaceColDocument = HydratedDocument<InterfaceColEntity>;

@Schema({ collection: 'interface_col', versionKey: false, strict: false })
export class InterfaceColEntity {
  @Prop({ type: Number, required: true })
  _id!: number;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: Number, required: true })
  uid!: number;

  @Prop({ type: Number, required: true })
  project_id!: number;

  @Prop({ type: String, default: '' })
  desc!: string;

  @Prop({ type: Number, default: 0 })
  index!: number;

  @Prop({ type: Number, default: 0 })
  add_time!: number;

  @Prop({ type: Number, default: 0 })
  up_time!: number;

  @Prop({ type: String, default: '{}' })
  test_report!: string;

  @Prop({ type: Boolean, default: false })
  checkHttpCodeIs200!: boolean;

  @Prop({ type: Boolean, default: false })
  checkResponseSchema!: boolean;

  @Prop({ type: SchemaTypes.Mixed, default: { name: 'code', value: '0', enable: false } })
  checkResponseField!: Record<string, unknown>;

  @Prop({ type: SchemaTypes.Mixed, default: { content: '', enable: false } })
  checkScript!: Record<string, unknown>;
}

export const InterfaceColSchema = SchemaFactory.createForClass(InterfaceColEntity);
InterfaceColSchema.index({ project_id: 1, name: 1 });
