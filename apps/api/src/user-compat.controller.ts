import { Body, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FastifyReply, FastifyRequest } from 'fastify';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Model } from 'mongoose';
import { resReturn } from './common/api-response';
import { mapError } from './common/error-response';
import { InputMap, pickNumber, pickString } from './common/request-utils';
import { AvatarEntity } from './database/schemas/avatar.schema';
import { GroupEntity } from './database/schemas/group.schema';
import { InterfaceEntity } from './database/schemas/interface.schema';
import { ProjectEntity } from './database/schemas/project.schema';
import { UserEntity } from './database/schemas/user.schema';
import { CounterService } from './services/counter.service';
import { LegacyCryptoService } from './services/legacy-crypto.service';
import { SessionAuthService, SessionUser } from './services/session-auth.service';

@Controller('user')
export class UserCompatController {
  constructor(
    @InjectModel(UserEntity.name)
    private readonly userModel: Model<UserEntity>,
    @InjectModel(GroupEntity.name)
    private readonly groupModel: Model<GroupEntity>,
    @InjectModel(ProjectEntity.name)
    private readonly projectModel: Model<ProjectEntity>,
    @InjectModel(InterfaceEntity.name)
    private readonly interfaceModel: Model<InterfaceEntity>,
    @InjectModel(AvatarEntity.name)
    private readonly avatarModel: Model<AvatarEntity>,
    private readonly counterService: CounterService,
    private readonly cryptoService: LegacyCryptoService,
    private readonly sessionService: SessionAuthService
  ) { }

  @Post('login')
  async login(@Body() body: InputMap, @Res({ passthrough: true }) reply: FastifyReply) {
    const email = pickString(body.email);
    const password = pickString(body.password);

    if (!email) {
      return resReturn(null, 400, 'email不能为空');
    }
    if (!password) {
      return resReturn(null, 400, '密码不能为空');
    }

    const user = await this.userModel.findOne({ email }).lean();
    if (!user) {
      return resReturn(null, 404, '该用户不存在');
    }
    const encrypted = this.cryptoService.hashPassword(password, user.passsalt || '');
    if (encrypted !== user.password) {
      return resReturn(null, 405, '密码错误');
    }

    reply.header('Set-Cookie', this.sessionService.buildLoginCookies(user._id, user.passsalt || ''));
    return resReturn(this.toLoginResult(user), 0, 'logout success...');
  }

  @Post('reg')
  async reg(@Body() body: InputMap, @Res({ passthrough: true }) reply: FastifyReply) {
    if (process.env.YAPI_CLOSE_REGISTER === 'true') {
      return resReturn(null, 400, '禁止注册，请联系管理员');
    }
    const email = pickString(body.email);
    const password = pickString(body.password);
    const rawUsername = pickString(body.username);

    if (!email) {
      return resReturn(null, 400, '邮箱不能为空');
    }
    if (!password) {
      return resReturn(null, 400, '密码不能为空');
    }

    const repeat = await this.userModel.countDocuments({ email });
    if (repeat > 0) {
      return resReturn(null, 401, '该email已经注册');
    }

    const uid = await this.counterService.next('user', '_id', 11);
    const passsalt = this.randSalt();
    const username = rawUsername || this.emailPrefix(email);
    const user: UserEntity = {
      _id: uid,
      username,
      password: this.cryptoService.hashPassword(password, passsalt),
      email,
      passsalt,
      study: false,
      role: 'member',
      type: 'site',
      add_time: this.now(),
      up_time: this.now()
    };
    await this.userModel.create(user);
    await this.handlePrivateGroup(user._id);
    reply.header('Set-Cookie', this.sessionService.buildLoginCookies(user._id, user.passsalt || ''));
    return resReturn({
      uid: user._id,
      email: user.email,
      username: user.username,
      add_time: user.add_time,
      up_time: user.up_time,
      role: 'member',
      type: user.type,
      study: false
    });
  }

  @Get('list')
  async list(@Req() req: FastifyRequest, @Query() query: InputMap) {
    const current = await this.sessionService.getCurrentUser(req);
    if (!current) {
      return resReturn(null, 40011, '请登录...');
    }
    const page = this.safePage(pickNumber(query.page));
    const limit = this.safeLimit(pickNumber(query.limit), 10);
    const [count, list] = await Promise.all([
      this.userModel.countDocuments({}),
      this.userModel
        .find({})
        .sort({ _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('_id username email role type add_time up_time study')
        .lean()
    ]);
    return resReturn({
      count,
      total: Math.ceil(count / limit),
      list
    });
  }

  @Get('find')
  async find(@Req() req: FastifyRequest, @Query() query: InputMap) {
    const current = await this.sessionService.getCurrentUser(req);
    if (!current) {
      return resReturn(null, 40011, '请登录...');
    }
    const uid = pickNumber(query.id);
    if (!uid) {
      return resReturn(null, 400, 'uid不能为空');
    }
    if (current.role !== 'admin' && uid !== current._id) {
      return resReturn(null, 401, '没有权限');
    }
    const result = await this.userModel.findOne({ _id: uid }).lean();
    if (!result) {
      return resReturn(null, 402, '不存在的用户');
    }
    return resReturn({
      uid: result._id,
      username: result.username,
      email: result.email,
      role: result.role,
      type: result.type,
      add_time: result.add_time,
      up_time: result.up_time
    });
  }

  @Post('update')
  async update(@Req() req: FastifyRequest, @Body() body: InputMap) {
    const current = await this.sessionService.getCurrentUser(req);
    if (!current) {
      return resReturn(null, 40011, '请登录...');
    }
    const uid = pickNumber(body.uid);
    if (!uid) {
      return resReturn(null, 400, 'uid不能为空');
    }
    if (current.role !== 'admin' && uid !== current._id) {
      return resReturn(null, 401, '没有权限');
    }
    const user = await this.userModel.findOne({ _id: uid }).lean();
    if (!user) {
      return resReturn(null, 400, 'uid不存在');
    }

    const username = pickString(body.username);
    const email = pickString(body.email);
    const role = pickString(body.role);
    if (email && email !== user.email) {
      const repeat = await this.userModel.countDocuments({ email, _id: { $ne: uid } });
      if (repeat > 0) {
        return resReturn(null, 401, '该email已经注册');
      }
    }
    const data: Record<string, unknown> = {
      up_time: this.now()
    };
    if (username) data.username = username;
    if (email) data.email = email;
    if (role && current.role === 'admin') {
      if (role !== 'admin' && role !== 'member') {
        return resReturn(null, 400, 'role参数有误');
      }
      data.role = role;
    }

    const [result] = await Promise.all([
      this.userModel.updateOne({ _id: uid }, { $set: data }),
      this.groupModel.updateMany(
        { 'members.uid': uid },
        {
          $set: {
            'members.$[m].username': username || user.username,
            'members.$[m].email': email || user.email
          }
        },
        { arrayFilters: [{ 'm.uid': uid }] }
      ),
      this.projectModel.updateMany(
        { 'members.uid': uid },
        {
          $set: {
            'members.$[m].username': username || user.username,
            'members.$[m].email': email || user.email
          }
        },
        { arrayFilters: [{ 'm.uid': uid }] }
      )
    ]);
    return resReturn({
      acknowledged: result.acknowledged,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount
    });
  }

  @Post('del')
  async del(@Req() req: FastifyRequest, @Body() body: InputMap) {
    const current = await this.sessionService.getCurrentUser(req);
    if (!current) {
      return resReturn(null, 40011, '请登录...');
    }
    if (current.role !== 'admin') {
      return resReturn(null, 402, 'Without permission.');
    }
    const uid = pickNumber(body.id);
    if (!uid) {
      return resReturn(null, 400, 'uid不能为空');
    }
    if (uid === current._id) {
      return resReturn(null, 403, '禁止删除管理员');
    }
    const result = await this.userModel.deleteOne({ _id: uid });
    return resReturn({
      acknowledged: result.acknowledged,
      deletedCount: result.deletedCount || 0
    });
  }

  @Get('up_study')
  async upStudy(@Req() req: FastifyRequest) {
    const current = await this.sessionService.getCurrentUser(req);
    if (!current) {
      return resReturn(null, 40011, '请登录...');
    }
    const result = await this.userModel.updateOne(
      { _id: current._id },
      {
        $set: {
          up_time: this.now(),
          study: true
        }
      }
    );
    return resReturn({
      acknowledged: result.acknowledged,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount
    });
  }

  @Post('change_password')
  async changePassword(@Req() req: FastifyRequest, @Body() body: InputMap) {
    const current = await this.sessionService.getCurrentUser(req);
    if (!current) {
      return resReturn(null, 40011, '请登录...');
    }
    const uid = pickNumber(body.uid);
    const password = pickString(body.password);
    const oldPassword = pickString(body.old_password);

    if (!uid) {
      return resReturn(null, 400, 'uid不能为空');
    }
    if (!password) {
      return resReturn(null, 400, '密码不能为空');
    }
    const user = await this.userModel.findOne({ _id: uid }).lean();
    if (!user) {
      return resReturn(null, 402, '不存在的用户');
    }

    if (current.role !== 'admin' && uid !== current._id) {
      return resReturn(null, 402, '没有权限');
    }

    if (current.role !== 'admin' || user.role === 'admin') {
      if (!oldPassword) {
        return resReturn(null, 400, '旧密码不能为空');
      }
      const encrypted = this.cryptoService.hashPassword(oldPassword, user.passsalt || '');
      if (encrypted !== user.password) {
        return resReturn(null, 402, '旧密码错误');
      }
    }

    const passsalt = this.randSalt();
    const result = await this.userModel.updateOne(
      { _id: uid },
      {
        $set: {
          up_time: this.now(),
          password: this.cryptoService.hashPassword(password, passsalt),
          passsalt
        }
      }
    );
    return resReturn({
      acknowledged: result.acknowledged,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount
    });
  }

  @Get('search')
  async search(@Req() req: FastifyRequest, @Query() query: InputMap) {
    const current = await this.sessionService.getCurrentUser(req);
    if (!current) {
      return resReturn(null, 40011, '请登录...');
    }
    const keyword = pickString(query.q);
    if (!keyword) {
      return resReturn(undefined, 400, 'No keyword.');
    }
    if (this.hasBadSearchKeyword(keyword)) {
      return resReturn(undefined, 400, 'Bad query.');
    }
    const regex = new RegExp(keyword, 'i');
    const list = await this.userModel
      .find(
        {
          $or: [{ email: regex }, { username: regex }]
        },
        {
          passsalt: 0,
          password: 0
        }
      )
      .limit(10)
      .lean();
    const output = list.map(item => ({
      uid: item._id,
      username: item.username,
      email: item.email,
      role: item.role,
      addTime: item.add_time,
      upTime: item.up_time
    }));
    return resReturn(output, 0, 'ok');
  }

  @Get('project')
  async project(@Req() req: FastifyRequest, @Query() query: InputMap) {
    const current = await this.sessionService.getCurrentUser(req);
    if (!current) {
      return resReturn(null, 40011, '请登录...');
    }
    let id = pickNumber(query.id);
    let type = pickString(query.type);
    const result: Record<string, unknown> = {};

    try {
      if (type === 'interface') {
        const api = id ? await this.interfaceModel.findOne({ _id: id }).lean() : null;
        if (!api) {
          throw new Error('不存在的接口');
        }
        result.interface = api;
        type = 'project';
        id = api.project_id;
      }

      if (type === 'project') {
        const project = id ? await this.projectModel.findOne({ _id: id }).lean() : null;
        if (!project) {
          throw new Error('不存在的项目');
        }
        const role = await this.resolveProjectRole(project, current);
        result.project = {
          ...project,
          role: role === 'owner' ? 'owner' : role === 'dev' ? 'dev' : 'member'
        };
        type = 'group';
        id = project.group_id;
      }

      if (type === 'group') {
        const group = id ? await this.groupModel.findOne({ _id: id }).lean() : null;
        if (!group) {
          throw new Error('不存在的分组');
        }
        const role = this.resolveGroupRole(group, current);
        result.group = {
          ...group,
          role: role === 'owner' ? 'owner' : role === 'dev' ? 'dev' : 'member'
        };
      }

      return resReturn(result);
    } catch (err) {
      const mapped = mapError(err);
      return resReturn(result, 422, mapped.errmsg);
    }
  }

  @Get('avatar')
  async avatar(@Req() req: FastifyRequest, @Res() reply: FastifyReply, @Query() query: InputMap) {
    const current = await this.sessionService.getCurrentUser(req);
    const uid = pickNumber(query.uid) || current?._id;
    const avatar = uid ? await this.avatarModel.findOne({ uid }).lean() : null;
    if (avatar?.basecode) {
      reply.header('Content-type', avatar.type || 'image/png');
      return reply.send(Buffer.from(avatar.basecode, 'base64'));
    }

    const fallbackPath = path.resolve(process.cwd(), 'static/image/avatar.png');
    if (fs.existsSync(fallbackPath)) {
      reply.header('Content-type', 'image/png');
      return reply.send(fs.readFileSync(fallbackPath));
    }

    reply.status(404);
    return reply.send('Not found');
  }

  @Post('upload_avatar')
  async uploadAvatar(@Req() req: FastifyRequest, @Body() body: InputMap) {
    const current = await this.sessionService.getCurrentUser(req);
    if (!current) {
      return resReturn(null, 40011, '请登录...');
    }
    let basecode = pickString(body.basecode);
    if (!basecode) {
      return resReturn(null, 400, 'basecode不能为空');
    }
    const pngPrefix = 'data:image/png;base64,';
    const jpegPrefix = 'data:image/jpeg;base64,';
    let type = '';
    if (basecode.startsWith(pngPrefix)) {
      basecode = basecode.slice(pngPrefix.length);
      type = 'image/png';
    } else if (basecode.startsWith(jpegPrefix)) {
      basecode = basecode.slice(jpegPrefix.length);
      type = 'image/jpeg';
    } else {
      return resReturn(null, 400, '仅支持jpeg和png格式的图片');
    }
    const bytes = Math.floor((basecode.length * 3) / 4);
    if (bytes > 200000) {
      return resReturn(null, 400, '图片大小不能超过200kb');
    }
    const result = await this.avatarModel.updateOne(
      { uid: current._id },
      {
        $set: {
          uid: current._id,
          basecode,
          type
        }
      },
      { upsert: true }
    );
    return resReturn({
      acknowledged: result.acknowledged,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
      upsertedId: result.upsertedId || null
    });
  }

  @Get('login_by_token')
  async loginByTokenGet(
    @Query() query: InputMap,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    const email = pickString(query.email);
    const username = pickString(query.username) || (email ? this.emailPrefix(email) : '');
    if (!email) {
      reply.redirect('/');
      return;
    }
    await this.handleThirdLogin(email, username, reply);
    reply.redirect('/group');
  }

  @Post('login_by_token')
  async loginByTokenPost(@Body() body: InputMap, @Res({ passthrough: true }) reply: FastifyReply) {
    const email = pickString(body.email);
    const username = pickString(body.username) || (email ? this.emailPrefix(email) : '');
    if (!email) {
      return resReturn(null, 400, 'email不能为空');
    }
    const user = await this.handleThirdLogin(email, username, reply);
    return resReturn(this.toLoginResult(user), 0, 'logout success...');
  }

  @Get('login_by_ldap')
  async loginByLdapGet() {
    return resReturn(null, 404, 'LDAP 功能未迁移');
  }

  @Post('login_by_ldap')
  async loginByLdapPost() {
    return resReturn(null, 404, 'LDAP 功能未迁移');
  }

  @Get('status')
  async status(@Req() req: FastifyRequest) {
    const current = await this.sessionService.getCurrentUser(req);
    if (!current) {
      return {
        ...resReturn(null, 40011, '请登录...'),
        ladp: false,
        canRegister: process.env.YAPI_CLOSE_REGISTER !== 'true'
      };
    }
    return {
      ...resReturn({
        _id: current._id,
        username: current.username,
        email: current.email,
        up_time: current.up_time,
        add_time: current.add_time,
        role: current.role,
        type: current.type || 'site',
        study: !!current.study
      }),
      ladp: false,
      canRegister: process.env.YAPI_CLOSE_REGISTER !== 'true'
    };
  }

  @Get('logout')
  async logout(@Res({ passthrough: true }) reply: FastifyReply) {
    reply.header('Set-Cookie', this.sessionService.buildLogoutCookies());
    return resReturn('ok');
  }

  private async handleThirdLogin(
    email: string,
    username: string,
    reply: FastifyReply
  ): Promise<UserEntity> {
    let user: any = await this.userModel.findOne({ email }).lean();
    if (!user) {
      const uid = await this.counterService.next('user', '_id', 11);
      const passsalt = this.randSalt();
      const now = this.now();
      const userDoc: UserEntity = {
        _id: uid,
        username: username || this.emailPrefix(email),
        password: this.cryptoService.hashPassword(passsalt, passsalt),
        email,
        passsalt,
        study: false,
        role: 'member',
        type: 'third',
        add_time: now,
        up_time: now
      };
      await this.userModel.create(userDoc);
      await this.handlePrivateGroup(uid);
      user = userDoc;
    }
    reply.header('Set-Cookie', this.sessionService.buildLoginCookies(user._id, user.passsalt || ''));
    return user as UserEntity;
  }

  private async handlePrivateGroup(uid: number): Promise<void> {
    const id = await this.counterService.next('group', '_id', 11);
    await this.groupModel.create({
      _id: id,
      uid,
      group_name: `User-${uid}`,
      group_desc: '',
      add_time: this.now(),
      up_time: this.now(),
      type: 'private',
      members: [],
      custom_field1: {
        name: '',
        enable: false
      }
    });
  }

  private resolveGroupRole(group: GroupEntity, user: SessionUser): 'owner' | 'dev' | 'guest' | 'member' {
    if (user.role === 'admin') return 'owner';
    if (Number(group.uid) === user._id) return 'owner';
    const members = Array.isArray(group.members)
      ? (group.members as Array<{ uid: number; role?: string }>)
      : [];
    const member = members.find(item => Number(item.uid) === user._id);
    if (!member) return 'member';
    if (member.role === 'owner') return 'owner';
    if (member.role === 'dev') return 'dev';
    if (member.role === 'guest') return 'guest';
    return 'member';
  }

  private async resolveProjectRole(
    project: ProjectEntity,
    user: SessionUser
  ): Promise<'owner' | 'dev' | 'guest' | 'member'> {
    if (user.role === 'admin') return 'owner';
    if (Number(project.uid) === user._id) return 'owner';

    const members = Array.isArray(project.members)
      ? (project.members as Array<{ uid: number; role?: string }>)
      : [];
    const member = members.find(item => Number(item.uid) === user._id);
    if (member?.role === 'owner') return 'owner';
    if (member?.role === 'dev') return 'dev';
    if (member?.role === 'guest') return 'guest';

    const group = await this.groupModel.findOne({ _id: project.group_id }).lean();
    if (!group) return 'member';
    return this.resolveGroupRole(group, user);
  }

  private toLoginResult(user: UserEntity) {
    return {
      username: user.username,
      role: user.role,
      uid: user._id,
      email: user.email,
      add_time: user.add_time,
      up_time: user.up_time,
      type: user.type || 'site',
      study: !!user.study
    };
  }

  private emailPrefix(email: string): string {
    const index = email.indexOf('@');
    if (index <= 0) return email;
    return email.slice(0, index);
  }

  private randSalt(): string {
    return randomBytes(8).toString('hex');
  }

  private now(): number {
    return Math.floor(Date.now() / 1000);
  }

  private safePage(page: number | undefined): number {
    if (!page || page < 1) return 1;
    return Math.floor(page);
  }

  private safeLimit(limit: number | undefined, fallback: number): number {
    if (!limit || limit < 1) return fallback;
    return Math.floor(limit);
  }

  private hasBadSearchKeyword(keyword: string): boolean {
    return /^\*|\?|\+|\$|\^|\\|\.$/.test(keyword);
  }
}
