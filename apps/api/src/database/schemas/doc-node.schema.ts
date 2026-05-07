import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type DocNodeDocument = HydratedDocument<DocNodeEntity>;
export type DocScopeType = 'group' | 'project';
export type DocNodeType = 'folder' | 'page';

@Schema({ collection: 'doc_node', versionKey: false })
export class DocNodeEntity {
  @Prop({ type: Number, required: true })
  _id!: number;

  @Prop({ type: String, required: true })
  scope_type!: DocScopeType;

  @Prop({ type: Number, default: 0 })
  group_id!: number;

  @Prop({ type: Number, default: 0 })
  project_id!: number;

  @Prop({ type: Number, required: true, default: 0 })
  parent_id!: number;

  @Prop({ type: String, required: true })
  node_type!: DocNodeType;

  @Prop({ type: String, required: true })
  title!: string;

  @Prop({ type: String, default: '' })
  markdown!: string;

  @Prop({ type: Number, default: 0 })
  index!: number;

  @Prop({ type: Number, required: true })
  uid!: number;

  @Prop({ type: Number, default: 0 })
  edit_uid!: number;

  @Prop({ type: Number, default: 0 })
  add_time!: number;

  @Prop({ type: Number, default: 0 })
  up_time!: number;
}

export const DocNodeSchema = SchemaFactory.createForClass(DocNodeEntity);

DocNodeSchema.index({ scope_type: 1, group_id: 1, parent_id: 1, index: 1 });
DocNodeSchema.index({ scope_type: 1, project_id: 1, parent_id: 1, index: 1 });
