import { Module } from '@nestjs/common';
import { DatabaseModule } from './modules/database.module';
import { InterfaceHttpModule } from './modules/interface-http.module';
import { PlatformHttpModule } from './modules/platform-http.module';
import { ProjectHttpModule } from './modules/project-http.module';
import { ServicesModule } from './modules/services.module';
import { SpecHttpModule } from './modules/spec-http.module';
import { UserHttpModule } from './modules/user-http.module';

@Module({
  imports: [
    DatabaseModule,
    ServicesModule,
    PlatformHttpModule,
    UserHttpModule,
    ProjectHttpModule,
    InterfaceHttpModule,
    SpecHttpModule
  ]
})
export class AppModule {}
