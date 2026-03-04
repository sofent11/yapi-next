import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type InterfaceCatDocument = HydratedDocument<InterfaceCatEntity>;

@Schema({ collection: 'interface_cat', versionKey: false, strict: false })
export class InterfaceCatEntity {
  @Prop({ type: Number, required: true })
  _id!: number;

  @Prop({ type: Number, required: true })
  project_id!: number;

  @Prop({ type: Number, required: true, default: 0 })
  uid!: number;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String, default: '' })
  desc!: string;

  @Prop({ type: Number, default: 0 })
  index!: number;

  @Prop({ type: Number, default: 0 })
  add_time!: number;

  @Prop({ type: Number, default: 0 })
  up_time!: number;
}

export const InterfaceCatSchema = SchemaFactory.createForClass(InterfaceCatEntity);
InterfaceCatSchema.index({ project_id: 1, name: 1 }, { unique: true });
