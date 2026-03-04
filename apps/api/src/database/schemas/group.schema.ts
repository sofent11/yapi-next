import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';

export type GroupDocument = HydratedDocument<GroupEntity>;

@Schema({ collection: 'group', versionKey: false, strict: false })
export class GroupEntity {
  @Prop({ type: Number, required: true })
  _id!: number;

  @Prop({ type: Number, required: true })
  uid!: number;

  @Prop({ type: String, required: true })
  group_name!: string;

  @Prop({ type: String, default: '' })
  group_desc!: string;

  @Prop({ type: Number, default: 0 })
  add_time!: number;

  @Prop({ type: Number, default: 0 })
  up_time!: number;

  @Prop({ type: String, default: 'public' })
  type!: 'public' | 'private';

  @Prop({ type: [SchemaTypes.Mixed], default: [] })
  members!: Array<{
    uid: number;
    role: 'owner' | 'dev' | 'guest';
    username?: string;
    email?: string;
  }>;

  @Prop({ type: SchemaTypes.Mixed, default: { name: '', enable: false } })
  custom_field1!: {
    name?: string;
    enable?: boolean;
  };
}

export const GroupSchema = SchemaFactory.createForClass(GroupEntity);
GroupSchema.index({ uid: 1, type: 1 });
GroupSchema.index({ type: 1, group_name: 1 });
