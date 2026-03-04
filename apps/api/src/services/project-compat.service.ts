import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { InterfaceCatService } from './interface-cat.service';
import { LegacyCryptoService } from './legacy-crypto.service';
import { SessionUser } from './session-auth.service';
import { CounterService } from './counter.service';
import { FollowEntity } from '../database/schemas/follow.schema';
import { GroupEntity } from '../database/schemas/group.schema';
import { InterfaceCaseEntity } from '../database/schemas/interface-case.schema';
import { ProjectEntity } from '../database/schemas/project.schema';
import { TokenEntity } from '../database/schemas/token.schema';
import { UserEntity } from '../database/schemas/user.schema';
import { InterfaceColEntity } from '../database/schemas/interface-col.schema';
import { InterfaceEntity } from '../database/schemas/interface.schema';
import { InterfaceCatEntity } from '../database/schemas/interface-cat.schema';

interface ProjectMember {
  uid: number;
  role?: string;
  username?: string;
  email?: string;
  email_notice?: boolean;
}

interface GroupMember {
  uid: number;
  role?: string;
}

interface FollowItem {
  uid: number;
  projectid: number;
  projectname: string;
  icon?: string;
  color?: string;
}

export type ProjectAuthAction = 'danger' | 'edit' | 'view';

@Injectable()
export class ProjectCompatService {
  constructor(
    @InjectModel(ProjectEntity.name)
    private readonly projectModel: Model<ProjectEntity>,
    @InjectModel(GroupEntity.name)
    private readonly groupModel: Model<GroupEntity>,
    @InjectModel(TokenEntity.name)
    private readonly tokenModel: Model<TokenEntity>,
    @InjectModel(UserEntity.name)
    private readonly userModel: Model<UserEntity>,
    @InjectModel(InterfaceEntity.name)
    private readonly interfaceModel: Model<InterfaceEntity>,
    @InjectModel(InterfaceCaseEntity.name)
    private readonly interfaceCaseModel: Model<InterfaceCaseEntity>,
    @InjectModel(InterfaceCatEntity.name)
    private readonly interfaceCatModel: Model<InterfaceCatEntity>,
    @InjectModel(InterfaceColEntity.name)
    private readonly interfaceColModel: Model<InterfaceColEntity>,
    @InjectModel(FollowEntity.name)
    private readonly followModel: Model<FollowEntity>,
    private readonly counterService: CounterService,
    private readonly catService: InterfaceCatService,
    private readonly cryptoService: LegacyCryptoService
  ) {}

  async list(groupId: number, user: SessionUser): Promise<Array<Record<string, unknown>>> {
    const group = await this.groupModel.findOne({ _id: groupId }).lean();
    if (!group) {
      return [];
    }
    const isPrivateGroup = group.type === 'private' && Number(group.uid) === user._id;
    const canGroupView = await this.canViewGroup(groupId, user);

    const [rows, followRows] = await Promise.all([
      this.projectModel.find({ group_id: groupId }).sort({ _id: -1 }).lean(),
      this.followModel.find({ uid: user._id }).lean()
    ]);
    const followProjectIds = new Set<number>(
      followRows
        .map(item => Number((item as unknown as FollowItem).projectid))
        .filter(item => Number.isFinite(item))
    );

    if (!isPrivateGroup) {
      const result: Array<Record<string, unknown>> = [];
      for (const item of rows) {
        if (item.project_type === 'private' && !canGroupView) {
          const members = this.projectMembers(item);
          const isMember =
            user.role === 'admin' ||
            Number(item.uid) === user._id ||
            members.some(member => Number(member.uid) === user._id);
          if (!isMember) {
            continue;
          }
        }
        const withFollow = {
          ...item,
          follow: followProjectIds.has(item._id)
        };
        if (withFollow.follow) {
          result.unshift(withFollow);
        } else {
          result.push(withFollow);
        }
      }
      return result;
    }

    const followed = followRows.map(item => ({
      ...(item as unknown as Record<string, unknown>),
      _id: Number((item as unknown as FollowItem).projectid),
      follow: true
    }));
    const merged = followed.concat(
      rows.map(item => ({
        ...item,
        follow: followProjectIds.has(item._id)
      }))
    );
    const seen = new Set<number>();
    const uniq: Array<Record<string, unknown>> = [];
    for (const item of merged) {
      const id = Number(item._id);
      if (!Number.isFinite(id) || seen.has(id)) continue;
      seen.add(id);
      uniq.push(item);
    }
    return uniq;
  }

  async get(
    projectId: number,
    options: { token?: string; user?: SessionUser | null }
  ): Promise<Record<string, unknown>> {
    const project = await this.requireProject(projectId);
    const canRead = await this.canView(project, options);
    if (!canRead) {
      throw new ForbiddenException('没有权限');
    }

    const cat = await this.catService.listByProject(projectId);
    const env = Array.isArray(project.env) ? project.env : [];
    const role = await this.resolveProjectRole(project, options.user);

    return {
      ...project,
      env: env.length > 0 ? env : [{ name: 'local', domain: 'http://127.0.0.1' }],
      cat,
      role
    };
  }

  async getEnv(projectId: number): Promise<Record<string, unknown> | null> {
    return this.projectModel.findOne({ _id: projectId }).select('env').lean();
  }

  async checkProjectName(name: string, groupId: number): Promise<void> {
    if (!name) {
      throw new ForbiddenException('项目名不能为空');
    }
    const repeat = await this.projectModel.countDocuments({ name, group_id: groupId });
    if (repeat > 0) {
      throw new ForbiddenException('已存在的项目名');
    }
  }

  async addProject(
    payload: Record<string, unknown>,
    user: SessionUser
  ): Promise<Record<string, unknown>> {
    const name = this.toOptionalString(payload.name);
    const groupId = this.toNumber(payload.group_id);
    if (!name || !groupId) {
      throw new Error('项目名或分组id不能为空');
    }
    await this.ensureGroupEditable(groupId, user);
    await this.checkProjectName(name, groupId);

    const basepathValue = this.normalizeBasepath(this.toOptionalString(payload.basepath));
    if (basepathValue === false) {
      throw new ForbiddenException('basepath格式有误');
    }

    const group = await this.requireGroup(groupId);
    const id = await this.counterService.next('project', '_id', 11);
    const now = this.now();
    const projectType =
      this.toOptionalString(payload.project_type) === 'public' ? 'public' : 'private';
    const data: Record<string, unknown> = {
      _id: id,
      uid: user._id,
      name,
      desc: this.toOptionalString(payload.desc) || '',
      basepath: typeof basepathValue === 'string' ? basepathValue : '',
      members: [],
      project_type: projectType,
      group_id: groupId,
      group_name: group.group_name || '',
      icon: this.toOptionalString(payload.icon) || '',
      color: this.toOptionalString(payload.color) || '',
      switch_notice: true,
      is_mock_open: false,
      is_json5: false,
      env: [{ name: 'local', domain: 'http://127.0.0.1' }],
      tag: [],
      add_time: now,
      up_time: now
    };
    if (user.role !== 'admin') {
      (data.members as ProjectMember[]).push({
        uid: user._id,
        role: 'owner',
        username: user.username,
        email: user.email,
        email_notice: true
      });
    }

    await this.projectModel.create(data);

    const [colId, catId] = await Promise.all([
      this.counterService.next('interface_col', '_id', 11),
      this.counterService.next('interface_cat', '_id', 11)
    ]);
    await Promise.all([
      this.interfaceColModel.create({
        _id: colId,
        name: '公共测试集',
        project_id: id,
        desc: '公共测试集',
        uid: user._id,
        add_time: now,
        up_time: now
      }),
      this.interfaceCatModel.create({
        _id: catId,
        name: '公共分类',
        project_id: id,
        desc: '公共分类',
        uid: user._id,
        add_time: now,
        up_time: now
      })
    ]);

    const created = await this.projectModel.findOne({ _id: id }).lean();
    return (created || data) as Record<string, unknown>;
  }

  async copyProject(
    payload: Record<string, unknown>,
    user: SessionUser
  ): Promise<Record<string, unknown>> {
    const name = this.toOptionalString(payload.name);
    const groupId = this.toNumber(payload.group_id);
    const sourceProjectId = this.toNumber(payload._id);
    if (!name || !groupId || !sourceProjectId) {
      throw new Error('项目名或分组id不能为空');
    }
    await this.ensureGroupEditable(groupId, user);
    await this.checkProjectName(name, groupId);

    const sourceProject = await this.requireProject(sourceProjectId);
    const sourceMeta = sourceProject as unknown as Record<string, unknown>;
    const basepathValue = this.normalizeBasepath(this.toOptionalString(payload.basepath));
    if (basepathValue === false) {
      throw new ForbiddenException('basepath格式有误');
    }
    const group = await this.requireGroup(groupId);
    const now = this.now();
    const newProjectId = await this.counterService.next('project', '_id', 11);
    const env =
      Array.isArray(payload.env) && payload.env.length > 0
        ? payload.env
        : Array.isArray(sourceProject.env) && sourceProject.env.length > 0
          ? sourceProject.env
          : [{ name: 'local', domain: 'http://127.0.0.1' }];

    const projectDoc: Record<string, unknown> = {
      _id: newProjectId,
      uid: user._id,
      name,
      desc: this.toOptionalString(payload.desc) || '',
      basepath: typeof basepathValue === 'string' ? basepathValue : '',
      members: [],
      project_type: this.toOptionalString(payload.project_type) === 'public' ? 'public' : 'private',
      group_id: groupId,
      group_name: group.group_name || '',
      icon: this.toOptionalString(payload.icon) || '',
      color: this.toOptionalString(payload.color) || '',
      add_time: now,
      up_time: now,
      pre_script: this.toOptionalString(payload.pre_script) || '',
      after_script: this.toOptionalString(payload.after_script) || '',
      project_mock_script: this.toOptionalString(payload.project_mock_script) || '',
      is_mock_open:
        typeof payload.is_mock_open === 'boolean'
          ? payload.is_mock_open
          : Boolean(sourceMeta.is_mock_open),
      switch_notice:
        typeof payload.switch_notice === 'boolean'
          ? payload.switch_notice
          : typeof sourceMeta.switch_notice === 'boolean'
            ? (sourceMeta.switch_notice as boolean)
            : true,
      is_json5: false,
      env,
      tag: Array.isArray(payload.tag) ? payload.tag : sourceProject.tag || []
    };
    await this.projectModel.create(projectDoc);

    const colId = await this.counterService.next('interface_col', '_id', 11);
    await this.interfaceColModel.create({
      _id: colId,
      name: '公共测试集',
      project_id: newProjectId,
      desc: '公共测试集',
      uid: user._id,
      add_time: now,
      up_time: now
    });

    const sourceCats = await this.interfaceCatModel.find({ project_id: sourceProjectId }).lean();
    const catIds = await this.counterService.nextMany('interface_cat', sourceCats.length, '_id', 11);
    const catIdMap = new Map<number, number>();
    if (sourceCats.length > 0) {
      await this.interfaceCatModel.insertMany(
        sourceCats.map((cat, idx) => {
          const newCatId = catIds[idx];
          catIdMap.set(cat._id, newCatId);
          return {
            ...cat,
            _id: newCatId,
            project_id: newProjectId,
            uid: user._id,
            add_time: now,
            up_time: now
          };
        }),
        { ordered: false }
      );
    }

    const sourceInterfaces = await this.interfaceModel.find({ project_id: sourceProjectId }).lean();
    const interfaceIds = await this.counterService.nextMany('interface', sourceInterfaces.length, '_id', 11);
    if (sourceInterfaces.length > 0) {
      await this.interfaceModel.insertMany(
        sourceInterfaces.map((api, idx) => ({
          ...api,
          _id: interfaceIds[idx],
          project_id: newProjectId,
          catid: catIdMap.get(api.catid) || catIds[0] || api.catid,
          uid: user._id,
          add_time: now,
          up_time: now
        })),
        { ordered: false }
      );
    }

    const sourceMembers = this.projectMembers(sourceProject);
    const members: ProjectMember[] = sourceMembers.map(item => ({
      uid: Number(item.uid),
      role: this.normalizeMemberRole(item.role, 'dev'),
      username: item.username,
      email: item.email,
      email_notice: item.email_notice !== false
    }));
    if (user.role !== 'admin' && !members.some(item => Number(item.uid) === user._id)) {
      members.push({
        uid: user._id,
        role: 'owner',
        username: user.username,
        email: user.email,
        email_notice: true
      });
    }
    if (members.length > 0) {
      await this.projectModel.updateOne({ _id: newProjectId }, { $set: { members } });
    }

    const created = await this.projectModel.findOne({ _id: newProjectId }).lean();
    return (created || projectDoc) as Record<string, unknown>;
  }

  async delProject(projectId: number, user: SessionUser): Promise<Record<string, unknown>> {
    const project = await this.requireProject(projectId);
    await this.ensureAuth(project, user, 'danger');

    const [interfaceResult, caseResult, colResult, catResult, followResult, tokenResult, projectResult] =
      await Promise.all([
        this.interfaceModel.deleteMany({ project_id: projectId }),
        this.interfaceCaseModel.deleteMany({ project_id: projectId }),
        this.interfaceColModel.deleteMany({ project_id: projectId }),
        this.interfaceCatModel.deleteMany({ project_id: projectId }),
        this.followModel.deleteMany({ projectid: projectId }),
        this.tokenModel.deleteMany({ project_id: projectId }),
        this.projectModel.deleteOne({ _id: projectId })
      ]);

    return {
      acknowledged:
        interfaceResult.acknowledged &&
        caseResult.acknowledged &&
        colResult.acknowledged &&
        catResult.acknowledged &&
        followResult.acknowledged &&
        tokenResult.acknowledged &&
        projectResult.acknowledged,
      deleted: {
        project: projectResult.deletedCount || 0,
        interface: interfaceResult.deletedCount || 0,
        interface_case: caseResult.deletedCount || 0,
        interface_col: colResult.deletedCount || 0,
        interface_cat: catResult.deletedCount || 0,
        follow: followResult.deletedCount || 0,
        token: tokenResult.deletedCount || 0
      }
    };
  }

  async changeMemberEmailNotice(
    projectId: number,
    memberUid: number,
    notice: boolean
  ): Promise<Record<string, unknown>> {
    const project = await this.requireProject(projectId);
    const exists = this.projectMembers(project).some(member => Number(member.uid) === memberUid);
    if (!exists) {
      throw new Error('项目成员不存在');
    }
    const result = await this.projectModel.updateOne(
      {
        _id: projectId,
        'members.uid': memberUid
      },
      {
        $set: {
          'members.$.email_notice': notice,
          up_time: this.now()
        }
      }
    );
    return {
      acknowledged: result.acknowledged,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount
    };
  }

  async upsetProject(
    projectId: number,
    payload: { icon?: string; color?: string },
    user: SessionUser
  ): Promise<Record<string, unknown>> {
    const project = await this.requireProject(projectId);
    await this.ensureAuth(project, user, 'danger');

    const data: Record<string, unknown> = {
      up_time: this.now()
    };
    if (typeof payload.icon === 'string') {
      data.icon = payload.icon;
    }
    if (typeof payload.color === 'string') {
      data.color = payload.color;
    }
    const result = await this.projectModel.updateOne({ _id: projectId }, { $set: data });
    await this.followModel.updateOne(
      { uid: user._id, projectid: projectId },
      { $set: data }
    );
    return {
      acknowledged: result.acknowledged,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount
    };
  }

  async searchKeyword(keyword: string): Promise<Record<string, unknown>> {
    if (!keyword) {
      throw new Error('No keyword.');
    }
    if (this.isBadSearchKeyword(keyword)) {
      throw new Error('Bad query.');
    }

    const regex = new RegExp(keyword, 'i');
    const [projectListRaw, groupListRaw, interfaceListRaw] = await Promise.all([
      this.projectModel.find({ name: regex }).limit(10).lean(),
      this.groupModel.find({ group_name: regex }).limit(10).lean(),
      this.interfaceModel.find({ title: regex }).limit(10).lean()
    ]);

    const project = projectListRaw.map(item => ({
      _id: item._id,
      name: item.name,
      basepath: item.basepath,
      uid: item.uid,
      env: item.env,
      members: item.members,
      groupId: item.group_id,
      upTime: item.up_time,
      addTime: (item as any).add_time
    }));
    const group = groupListRaw.map(item => ({
      _id: item._id,
      uid: item.uid,
      groupName: item.group_name,
      groupDesc: item.group_desc,
      addTime: item.add_time,
      upTime: item.up_time
    }));
    const api = interfaceListRaw.map(item => ({
      _id: item._id,
      uid: item.uid,
      title: item.title,
      projectId: item.project_id,
      addTime: item.add_time,
      upTime: item.up_time
    }));

    return {
      project,
      group,
      interface: api
    };
  }

  async fetchSwaggerUrl(sourceUrl: string): Promise<Record<string, unknown>> {
    const response = await axios.get(sourceUrl, { timeout: 20000 });
    const data = response.data;
    if (data == null || typeof data !== 'object') {
      throw new Error('返回数据格式不是 JSON');
    }
    return data as Record<string, unknown>;
  }

  async updateProject(
    projectId: number,
    payload: Record<string, unknown>,
    user: SessionUser
  ): Promise<Record<string, unknown>> {
    const project = await this.requireProject(projectId);
    await this.ensureAuth(project, user, 'danger');

    const data: Record<string, unknown> = {
      up_time: this.now()
    };
    if (typeof payload.name === 'string' && payload.name.trim()) {
      const name = payload.name.trim();
      if (name !== project.name) {
        const targetGroupId = this.toNumber(payload.group_id) || project.group_id;
        const repeat = await this.projectModel.countDocuments({
          group_id: targetGroupId,
          name
        });
        if (repeat > 0) {
          throw new ForbiddenException('已存在的项目名');
        }
      }
      data.name = name;
    }

    const basepathValue = this.normalizeBasepath(this.toOptionalString(payload.basepath));
    if (basepathValue === false) {
      throw new ForbiddenException('basepath格式有误');
    }
    if (typeof basepathValue === 'string') {
      data.basepath = basepathValue;
    }

    const fields = [
      'desc',
      'pre_script',
      'after_script',
      'project_mock_script',
      'is_mock_open',
      'switch_notice',
      'strice',
      'is_json5',
      'color',
      'icon',
      'project_type'
    ];
    for (const key of fields) {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        data[key] = payload[key];
      }
    }

    const result = await this.projectModel.updateOne({ _id: projectId }, { $set: data });
    return {
      acknowledged: result.acknowledged,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount
    };
  }

  async updateProjectEnv(
    projectId: number,
    env: Array<Record<string, unknown>>,
    user: SessionUser
  ): Promise<Record<string, unknown>> {
    const project = await this.requireProject(projectId);
    await this.ensureAuth(project, user, 'edit');
    if (this.hasDuplicateByKey(env, 'name')) {
      throw new ForbiddenException('环境变量名重复');
    }
    const result = await this.projectModel.updateOne(
      { _id: projectId },
      {
        $set: {
          env,
          up_time: this.now()
        }
      }
    );
    return {
      acknowledged: result.acknowledged,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount
    };
  }

  async updateProjectTag(
    projectId: number,
    tag: Array<Record<string, unknown>>,
    user: SessionUser
  ): Promise<Record<string, unknown>> {
    const project = await this.requireProject(projectId);
    await this.ensureAuth(project, user, 'edit');
    const result = await this.projectModel.updateOne(
      { _id: projectId },
      {
        $set: {
          tag,
          up_time: this.now()
        }
      }
    );
    return {
      acknowledged: result.acknowledged,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount
    };
  }

  async getMemberList(projectId: number): Promise<ProjectMember[]> {
    const project = await this.requireProject(projectId);
    return this.projectMembers(project);
  }

  async addMembers(
    projectId: number,
    memberUids: number[],
    role: string | undefined,
    user: SessionUser
  ): Promise<{
    result: Record<string, unknown>;
    add_members: ProjectMember[];
    exist_members: ProjectMember[];
    no_members: number[];
  }> {
    const project = await this.requireProject(projectId);
    await this.ensureAuth(project, user, 'edit');

    const normalizedRole = this.normalizeMemberRole(role, 'dev');
    const addMembers: ProjectMember[] = [];
    const existMembers: ProjectMember[] = [];
    const noMembers: number[] = [];
    const existed = this.projectMembers(project);

    const uniqueUids = Array.from(new Set(memberUids.filter(uid => Number.isFinite(uid))));
    for (const uid of uniqueUids) {
      const userData = await this.userModel.findOne({ _id: uid }).lean();
      const memberData: ProjectMember = {
        uid,
        role: normalizedRole,
        username: userData?.username,
        email: userData?.email,
        email_notice: true
      };
      if (existed.some(item => Number(item.uid) === uid)) {
        existMembers.push(memberData);
        continue;
      }
      if (!userData) {
        noMembers.push(uid);
        continue;
      }
      addMembers.push(memberData);
    }

    let result: Record<string, unknown> = {
      acknowledged: true,
      matchedCount: 1,
      modifiedCount: 0
    };
    if (addMembers.length > 0) {
      const write = await this.projectModel.updateOne(
        { _id: projectId },
        {
          $push: {
            members: { $each: addMembers }
          },
          $set: {
            up_time: this.now()
          }
        }
      );
      result = {
        acknowledged: write.acknowledged,
        matchedCount: write.matchedCount,
        modifiedCount: write.modifiedCount
      };
    }

    return {
      result,
      add_members: addMembers,
      exist_members: existMembers,
      no_members: noMembers
    };
  }

  async delMember(projectId: number, memberUid: number, user: SessionUser): Promise<Record<string, unknown>> {
    const project = await this.requireProject(projectId);
    const exists = this.projectMembers(project).some(member => Number(member.uid) === memberUid);
    if (!exists) {
      throw new Error('项目成员不存在');
    }
    await this.ensureAuth(project, user, 'danger');
    const result = await this.projectModel.updateOne(
      { _id: projectId },
      {
        $pull: {
          members: { uid: memberUid }
        },
        $set: {
          up_time: this.now()
        }
      }
    );
    return {
      acknowledged: result.acknowledged,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount
    };
  }

  async changeMemberRole(
    projectId: number,
    memberUid: number,
    role: string | undefined,
    user: SessionUser
  ): Promise<Record<string, unknown>> {
    const project = await this.requireProject(projectId);
    const exists = this.projectMembers(project).some(member => Number(member.uid) === memberUid);
    if (!exists) {
      throw new Error('项目成员不存在');
    }
    await this.ensureAuth(project, user, 'danger');
    const normalizedRole = this.normalizeMemberRole(role, 'dev');
    const result = await this.projectModel.updateOne(
      {
        _id: projectId,
        'members.uid': memberUid
      },
      {
        $set: {
          'members.$.role': normalizedRole,
          up_time: this.now()
        }
      }
    );
    return {
      acknowledged: result.acknowledged,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount
    };
  }

  async getOrCreateToken(projectId: number): Promise<string> {
    const existed = await this.tokenModel.findOne({ project_id: projectId }).lean();
    if (existed?.token) {
      return existed.token;
    }
    const token = this.cryptoService.createProjectToken();
    await this.tokenModel.create({
      project_id: projectId,
      token
    });
    return token;
  }

  async rotateToken(projectId: number): Promise<{ token: string; result: Record<string, unknown> }> {
    const existed = await this.tokenModel.findOne({ project_id: projectId }).lean();
    if (!existed?.token) {
      throw new NotFoundException('没有查到token信息');
    }
    const token = this.cryptoService.createProjectToken();
    const writeResult = await this.tokenModel.updateOne(
      { project_id: projectId },
      { $set: { token } }
    );
    return {
      token,
      result: {
        acknowledged: writeResult.acknowledged,
        matchedCount: writeResult.matchedCount,
        modifiedCount: writeResult.modifiedCount
      }
    };
  }

  async resolveTokenProject(token: string | undefined): Promise<{ projectId: number; uid?: number } | null> {
    const unwrapped = this.cryptoService.unwrapProjectToken(token);
    if (!unwrapped.token) return null;
    const tokenData = await this.tokenModel.findOne({ token: unwrapped.token }).lean();
    if (!tokenData) return null;
    return {
      projectId: tokenData.project_id,
      uid: unwrapped.uid
    };
  }

  async assertProjectExists(projectId: number): Promise<void> {
    const existed = await this.projectModel.exists({ _id: projectId });
    if (!existed) {
      throw new NotFoundException('不存在的项目');
    }
  }

  async assertProjectPermission(
    projectId: number,
    action: ProjectAuthAction,
    options: { user?: SessionUser | null; token?: string }
  ): Promise<ProjectEntity> {
    const project = await this.requireProject(projectId);
    const tokenAuth = await this.resolveTokenAuthUser(projectId, options.token);

    if (action === 'view') {
      if (tokenAuth.ok) {
        if (!tokenAuth.user) {
          return project;
        }
        if (this.canViewByUser(project, tokenAuth.user)) {
          return project;
        }
      }
      if (await this.canView(project, options)) {
        return project;
      }
      throw new ForbiddenException('没有权限');
    }

    if (tokenAuth.ok && !tokenAuth.user) {
      // 兼容历史 token 行为：仅 project token（不带 uid）允许编辑但不允许危险操作。
      if (action === 'edit') {
        return project;
      }
      throw new ForbiddenException('没有权限');
    }

    const authUser = tokenAuth.user || options.user;
    await this.ensureAuth(project, authUser, action);
    return project;
  }

  private async canView(
    project: ProjectEntity,
    options: { token?: string; user?: SessionUser | null }
  ): Promise<boolean> {
    if (project.project_type !== 'private') {
      return true;
    }

    const tokenProject = await this.resolveTokenProject(options.token);
    if (tokenProject?.projectId === project._id) {
      return true;
    }

    if (!options.user) {
      return false;
    }
    return this.canViewByUser(project, options.user);
  }

  private canViewByUser(project: ProjectEntity, user: SessionUser): boolean {
    if (user.role === 'admin') {
      return true;
    }
    if (project.project_type !== 'private') {
      return true;
    }
    if (project.uid === user._id) {
      return true;
    }
    const members = Array.isArray(project.members) ? (project.members as ProjectMember[]) : [];
    return members.some(member => Number(member?.uid) === user._id);
  }

  private async resolveProjectRole(
    project: ProjectEntity,
    user: SessionUser | null | undefined
  ): Promise<string> {
    if (!user) return 'guest';
    if (user.role === 'admin') return 'admin';
    if (project.uid === user._id) return 'owner';

    const members = Array.isArray(project.members) ? (project.members as ProjectMember[]) : [];
    const found = members.find(member => Number(member?.uid) === user._id);
    if (found?.role === 'owner') return 'owner';
    if (found?.role === 'dev') return 'dev';
    if (found?.role === 'guest') return 'guest';

    const groupRole = await this.resolveGroupRole(project.group_id, user);
    if (groupRole === 'admin' || groupRole === 'owner' || groupRole === 'dev' || groupRole === 'guest') {
      return groupRole;
    }
    return 'member';
  }

  private async resolveGroupRole(groupId: number, user: SessionUser): Promise<string> {
    if (user.role === 'admin') return 'admin';
    const group = await this.groupModel.findOne({ _id: groupId }).lean();
    if (!group) return 'member';
    if (group.uid === user._id) return 'owner';
    const members = Array.isArray(group.members) ? (group.members as GroupMember[]) : [];
    const found = members.find(member => Number(member?.uid) === user._id);
    if (found?.role === 'owner') return 'owner';
    if (found?.role === 'dev') return 'dev';
    if (found?.role === 'guest') return 'guest';
    return 'member';
  }

  private async canViewGroup(groupId: number, user: SessionUser): Promise<boolean> {
    const role = await this.resolveGroupRole(groupId, user);
    return role === 'admin' || role === 'owner' || role === 'dev' || role === 'guest';
  }

  private async ensureGroupEditable(groupId: number, user: SessionUser): Promise<void> {
    const role = await this.resolveGroupRole(groupId, user);
    if (role === 'admin' || role === 'owner' || role === 'dev') {
      return;
    }
    throw new ForbiddenException('没有权限');
  }

  private async ensureAuth(
    project: ProjectEntity,
    user: SessionUser | null | undefined,
    action: ProjectAuthAction
  ): Promise<void> {
    if (!user) {
      throw new ForbiddenException('没有权限');
    }
    const role = await this.resolveProjectRole(project, user);
    if (action === 'danger') {
      if (role === 'admin' || role === 'owner') return;
      throw new ForbiddenException('没有权限');
    }
    if (action === 'edit') {
      if (role === 'admin' || role === 'owner' || role === 'dev') return;
      throw new ForbiddenException('没有权限');
    }
    if (role === 'admin' || role === 'owner' || role === 'dev' || role === 'guest') {
      return;
    }
    throw new ForbiddenException('没有权限');
  }

  private async requireProject(projectId: number): Promise<ProjectEntity> {
    const project = await this.projectModel.findOne({ _id: projectId }).lean();
    if (!project) {
      throw new NotFoundException('不存在的项目');
    }
    return project;
  }

  private async requireGroup(groupId: number): Promise<GroupEntity> {
    const group = await this.groupModel.findOne({ _id: groupId }).lean();
    if (!group) {
      throw new NotFoundException('分组不存在');
    }
    return group;
  }

  private hasDuplicateByKey(rows: Array<Record<string, unknown>>, key: string): boolean {
    const values = new Set<string>();
    for (const row of rows) {
      const value = this.toOptionalString(row[key]);
      if (!value) continue;
      if (values.has(value)) return true;
      values.add(value);
    }
    return false;
  }

  private normalizeBasepath(basepath: string | undefined): string | undefined | false {
    if (typeof basepath === 'undefined') return undefined;
    if (!basepath) return '';
    if (basepath === '/') return '';
    let value = basepath;
    if (!value.startsWith('/')) {
      value = `/${value}`;
    }
    if (value.endsWith('/')) {
      value = value.slice(0, -1);
    }
    if (!/^\/[a-zA-Z0-9\-\/\._]+$/.test(value)) {
      return false;
    }
    return value;
  }

  private toNumber(input: unknown): number | undefined {
    if (typeof input === 'number' && Number.isFinite(input)) return input;
    if (typeof input === 'string' && input.trim()) {
      const value = Number(input);
      if (Number.isFinite(value)) return value;
    }
    return undefined;
  }

  private toOptionalString(input: unknown): string | undefined {
    if (typeof input !== 'string') return undefined;
    return input.trim();
  }

  private projectMembers(project: ProjectEntity): ProjectMember[] {
    return Array.isArray(project.members) ? (project.members as ProjectMember[]) : [];
  }

  private async resolveTokenAuthUser(
    projectId: number,
    token: string | undefined
  ): Promise<{ ok: boolean; user?: SessionUser }> {
    if (!token) {
      return { ok: false };
    }
    const tokenProject = await this.resolveTokenProject(token);
    if (!tokenProject || tokenProject.projectId !== projectId) {
      return { ok: false };
    }
    if (!tokenProject.uid) {
      return { ok: true };
    }
    const user = await this.userModel.findOne({ _id: tokenProject.uid }).lean();
    if (!user) {
      return { ok: true };
    }
    return {
      ok: true,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role || 'member',
        type: user.type,
        study: user.study,
        add_time: user.add_time,
        up_time: user.up_time,
        passsalt: user.passsalt
      }
    };
  }

  private normalizeMemberRole(input: string | undefined, fallback: 'owner' | 'dev' | 'guest'): 'owner' | 'dev' | 'guest' {
    const value = (input || '').toLowerCase();
    if (value === 'owner' || value === 'dev' || value === 'guest') {
      return value;
    }
    return fallback;
  }

  private isBadSearchKeyword(keyword: string): boolean {
    return /^\*|\?|\+|\$|\^|\\|\.$/.test(keyword);
  }

  private now(): number {
    return Math.floor(Date.now() / 1000);
  }
}
