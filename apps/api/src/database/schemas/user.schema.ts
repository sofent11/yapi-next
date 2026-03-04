import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<UserEntity>;

@Schema({ collection: 'user', versionKey: false, strict: false })
export class UserEntity {
  @Prop({ type: Number, required: true })
  _id!: number;

  @Prop({ type: String, required: true })
  username!: string;

  @Prop({ type: String, required: true })
  password!: string;

  @Prop({ type: String, required: true })
  email!: string;

  @Prop({ type: String, default: '' })
  passsalt!: string;

  @Prop({ type: Boolean, default: false })
  study!: boolean;

  @Prop({ type: String, default: 'member' })
  role!: string;

  @Prop({ type: String, default: 'site' })
  type!: string;

  @Prop({ type: Number, default: 0 })
  add_time!: number;

  @Prop({ type: Number, default: 0 })
  up_time!: number;
}

export const UserSchema = SchemaFactory.createForClass(UserEntity);
UserSchema.index({ email: 1 });
