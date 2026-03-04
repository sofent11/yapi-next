import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';

export type ProjectDocument = HydratedDocument<ProjectEntity>;

@Schema({ collection: 'project', versionKey: false, strict: false })
export class ProjectEntity {
  @Prop({ type: Number, required: true })
  _id!: number;

  @Prop({ type: Number, required: true })
  uid!: number;

  @Prop({ type: Number, required: true, default: 0 })
  group_id!: number;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String, default: '' })
  basepath!: string;

  @Prop({ type: String, default: '' })
  desc!: string;

  @Prop({ type: String, default: '' })
  icon!: string;

  @Prop({ type: String, default: '' })
  color!: string;

  @Prop({ type: String, default: 'public' })
  project_type!: 'public' | 'private';

  @Prop({ type: [SchemaTypes.Mixed], default: [] })
  members!: Array<{
    uid: number;
    role: 'owner' | 'dev' | 'guest';
    username?: string;
    email?: string;
  }>;

  @Prop({ type: [SchemaTypes.Mixed], default: [] })
  env!: Array<Record<string, unknown>>;

  @Prop({ type: Number, default: 0 })
  up_time!: number;

  @Prop({ type: [SchemaTypes.Mixed], default: [] })
  tag!: Array<{ name: string; desc: string }>;
}

export const ProjectSchema = SchemaFactory.createForClass(ProjectEntity);
