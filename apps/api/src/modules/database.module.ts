import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AvatarEntity, AvatarSchema } from '../database/schemas/avatar.schema';
import { CounterEntity, CounterSchema } from '../database/schemas/counter.schema';
import { FollowEntity, FollowSchema } from '../database/schemas/follow.schema';
import { GroupEntity, GroupSchema } from '../database/schemas/group.schema';
import { InterfaceCaseEntity, InterfaceCaseSchema } from '../database/schemas/interface-case.schema';
import { InterfaceCatEntity, InterfaceCatSchema } from '../database/schemas/interface-cat.schema';
import { InterfaceColEntity, InterfaceColSchema } from '../database/schemas/interface-col.schema';
import { InterfaceEntity, InterfaceSchema } from '../database/schemas/interface.schema';
import { LogEntity, LogSchema } from '../database/schemas/log.schema';
import { ProjectEntity, ProjectSchema } from '../database/schemas/project.schema';
import { SpecImportTaskEntity, SpecImportTaskSchema } from '../database/schemas/spec-import-task.schema';
import { TokenEntity, TokenSchema } from '../database/schemas/token.schema';
import { UserEntity, UserSchema } from '../database/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forRoot(process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/yapi', {
      autoIndex: process.env.MONGO_AUTO_INDEX !== 'false'
    }),
    MongooseModule.forFeature([
      { name: CounterEntity.name, schema: CounterSchema },
      { name: AvatarEntity.name, schema: AvatarSchema },
      { name: GroupEntity.name, schema: GroupSchema },
      { name: FollowEntity.name, schema: FollowSchema },
      { name: ProjectEntity.name, schema: ProjectSchema },
      { name: TokenEntity.name, schema: TokenSchema },
      { name: UserEntity.name, schema: UserSchema },
      { name: InterfaceCatEntity.name, schema: InterfaceCatSchema },
      { name: InterfaceEntity.name, schema: InterfaceSchema },
      { name: InterfaceCaseEntity.name, schema: InterfaceCaseSchema },
      { name: InterfaceColEntity.name, schema: InterfaceColSchema },
      { name: LogEntity.name, schema: LogSchema },
      { name: SpecImportTaskEntity.name, schema: SpecImportTaskSchema }
    ])
  ],
  exports: [MongooseModule]
})
export class DatabaseModule {}
