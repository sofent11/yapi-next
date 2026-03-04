import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TokenDocument = HydratedDocument<TokenEntity>;

@Schema({ collection: 'token', versionKey: false, strict: false })
export class TokenEntity {
  @Prop({ type: Number, required: true })
  project_id!: number;

  @Prop({ type: String, required: true })
  token!: string;
}

export const TokenSchema = SchemaFactory.createForClass(TokenEntity);
TokenSchema.index({ token: 1 }, { unique: true });
TokenSchema.index({ project_id: 1 }, { unique: true });
