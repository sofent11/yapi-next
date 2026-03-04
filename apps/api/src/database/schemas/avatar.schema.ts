import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AvatarDocument = HydratedDocument<AvatarEntity>;

@Schema({ collection: 'avatar', versionKey: false, strict: false })
export class AvatarEntity {
  @Prop({ type: Number, required: true })
  uid!: number;

  @Prop({ type: String, default: '' })
  basecode!: string;

  @Prop({ type: String, default: 'image/png' })
  type!: string;
}

export const AvatarSchema = SchemaFactory.createForClass(AvatarEntity);
AvatarSchema.index({ uid: 1 }, { unique: true });
