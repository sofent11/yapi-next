import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type FollowDocument = HydratedDocument<FollowEntity>;

@Schema({ collection: 'follow', versionKey: false, strict: false })
export class FollowEntity {
  @Prop({ type: Number, required: true })
  uid!: number;

  @Prop({ type: Number, required: true })
  projectid!: number;

  @Prop({ type: String, required: true })
  projectname!: string;

  @Prop({ type: String, default: '' })
  icon!: string;

  @Prop({ type: String, default: '' })
  color!: string;
}

export const FollowSchema = SchemaFactory.createForClass(FollowEntity);
FollowSchema.index({ uid: 1, projectid: 1 }, { unique: true });
