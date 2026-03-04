import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CounterService } from './counter.service';
import { SessionUser } from './session-auth.service';
import { FollowEntity } from '../database/schemas/follow.schema';
import { GroupEntity } from '../database/schemas/group.schema';
import { InterfaceCaseEntity } from '../database/schemas/interface-case.schema';
import { InterfaceCatEntity } from '../database/schemas/interface-cat.schema';
import { InterfaceColEntity } from '../database/schemas/interface-col.schema';
import { InterfaceEntity } from '../database/schemas/interface.schema';
import { ProjectEntity } from '../database/schemas/project.schema';
import { TokenEntity } from '../database/schemas/token.schema';
import { UserEntity } from '../database/schemas/user.schema';

interface GroupMember {
  uid: number;
  role?: string;
  _role?: string;
  username?: string;
  email?: string;
}

@Injectable()
export class GroupCompatService {
  constructor(
    @InjectModel(GroupEntity.name)
    private readonly groupModel: Model<GroupEntity>,
    @InjectModel(ProjectEntity.name)
    private readonly projectModel: Model<ProjectEntity>,
    @InjectModel(InterfaceEntity.name)
    private readonly interfaceModel: Model<InterfaceEntity>,
    @InjectModel(InterfaceCaseEntity.name)
    private readonly interfaceCaseModel: Model<InterfaceCaseEntity>,
    @InjectModel(InterfaceColEntity.name)
    private readonly interfaceColModel: Model<InterfaceColEntity>,
    @InjectModel(InterfaceCatEntity.name)
    private readonly interfaceCatModel: Model<InterfaceCatEntity>,
    @InjectModel(TokenEntity.name)
    private readonly tokenModel: Model<TokenEntity>,
    @InjectModel(FollowEntity.name)
    private readonly followModel: Model<FollowEntity>,
    @InjectModel(UserEntity.name)
    private readonly userModel: Model<UserEntity>,
    private readonly counterService: CounterService
  ) {}

  async getMyGroup(user: SessionUser): Promise<Record<string, unknown>> {
    const group = await this.getOrCreatePrivateGroup(user);
    return {
      ...group,
      group_name: '个人空间',
      role: 'owner'
    };
  }

  async list(user: SessionUser): Promise<Record<string, unknown>[]> {
    const privateGroup = await this.getMyGroup(user);
    const results: Record<string, unknown>[] = [];

    if (user.role === 'admin') {
      const groups = await this.groupModel
        .find({ type: 'public' })
        .select('group_name _id group_desc add_time up_time type uid custom_field1 members')
        .lean();
      groups.forEach(group => results.push(this.attachRole(group, user)));
      return [privateGroup, ...results];
    }

    const authGroups = await this.groupModel
      .find({
        $or: [
          { 'members.uid': user._id, type: 'public' },
          { uid: user._id, type: 'public' }
        ]
      })
      .select('group_name _id group_desc add_time up_time type uid custom_field1 members')
      .lean();

    const seen = new Set<number>();
    authGroups.forEach(group => {
      seen.add(group._id);
      results.push(this.attachRole(group, user));
    });

    const projectAuth = await this.projectModel
      .find({
        $or: [
          { 'members.uid': user._id, project_type: 'private' },
          { uid: user._id, project_type: 'private' },
          { project_type: 'public' }
        ]
      })
      .select('group_id')
      .lean();
    const groupIds = Array.from(
      new Set(
        projectAuth
          .map(item => Number(item.group_id))
          .filter(id => Number.isFinite(id) && !seen.has(id))
      )
    );

    if (groupIds.length > 0) {
      const byProjects = await this.groupModel
        .find({
          _id: { $in: groupIds },
          type: 'public'
        })
        .select('group_name _id group_desc add_time up_time type uid custom_field1 members')
        .lean();
      byProjects.forEach(group => {
        if (seen.has(group._id)) return;
        seen.add(group._id);
        results.push(this.attachRole(group, user));
      });
    }

    return [privateGroup, ...results];
  }

  async get(groupId: number, user: SessionUser): Promise<Record<string, unknown>> {
    const group = await this.groupModel
      .findOne({ _id: groupId })
      .select('uid group_name group_desc add_time up_time type custom_field1 members')
      .lean();
    if (!group) {
      throw new NotFoundException('分组不存在');
    }
    const data = this.attachRole(group, user);
    if (data.type === 'private') {
      data.group_name = '个人空间';
    }
    return data;
  }

  async getById(groupId: number): Promise<GroupEntity | null> {
    return this.groupModel.findOne({ _id: groupId }).lean();
  }

  async resolveRole(groupId: number, user: SessionUser): Promise<string> {
    if (user.role === 'admin') return 'admin';
    const group = await this.groupModel.findOne({ _id: groupId }).lean();
    if (!group) return 'member';
    return this.resolveRoleFromGroup(group, user);
  }

  async addGroup(
    payload: { group_name: string; group_desc?: string; owner_uids?: number[] },
    user: SessionUser
  ): Promise<Record<string, unknown>> {
    const groupName = (payload.group_name || '').trim();
    if (!groupName) {
      throw new Error('项目分组名不能为空');
    }
    const checkRepeat = await this.groupModel.countDocuments({ group_name: groupName });
    if (checkRepeat > 0) {
      throw new Error('项目分组名已存在');
    }

    const ownerUids = Array.isArray(payload.owner_uids) ? payload.owner_uids.slice() : [];
    if (ownerUids.length === 0) {
      ownerUids.push(user._id);
    }

    const owners: GroupMember[] = [];
    for (const uid of ownerUids) {
      const groupUser = await this.getUserdata(uid, 'owner');
      if (groupUser) {
        owners.push(groupUser);
      }
    }

    const id = await this.counterService.next('group', '_id', 11);
    const now = this.now();
    const createData: GroupEntity = {
      _id: id,
      uid: user._id,
      group_name: groupName,
      group_desc: payload.group_desc || '',
      add_time: now,
      up_time: now,
      type: 'public',
      members: owners.map(member => ({
        uid: member.uid,
        role: (member.role as 'owner' | 'dev' | 'guest') || 'owner',
        username: member.username,
        email: member.email
      })),
      custom_field1: {
        name: '',
        enable: false
      }
    };
    await this.groupModel.create(createData);
    return {
      _id: createData._id,
      group_name: createData.group_name,
      group_desc: createData.group_desc,
      uid: createData.uid,
      members: createData.members,
      type: createData.type
    };
  }

  async upGroup(
    groupId: number,
    payload: {
      group_name?: string;
      group_desc?: string;
      custom_field1?: { name?: string; enable?: boolean };
    },
    user: SessionUser
  ): Promise<Record<string, unknown>> {
    const group = await this.requireGroup(groupId);
    await this.ensureDanger(group, user);
    const data: Record<string, unknown> = {
      up_time: this.now()
    };
    if (typeof payload.group_name === 'string') {
      data.group_name = payload.group_name.trim();
    }
    if (typeof payload.group_desc === 'string') {
      data.group_desc = payload.group_desc;
    }
    if (payload.custom_field1 && typeof payload.custom_field1 === 'object') {
      data.custom_field1 = {
        name: typeof payload.custom_field1.name === 'string' ? payload.custom_field1.name : '',
        enable: Boolean(payload.custom_field1.enable)
      };
    }
    const result = await this.groupModel.updateOne({ _id: groupId }, { $set: data });
    return {
      acknowledged: result.acknowledged,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount
    };
  }

  async getMemberList(groupId: number): Promise<GroupMember[]> {
    const group = await this.requireGroup(groupId);
    return Array.isArray(group.members) ? (group.members as GroupMember[]) : [];
  }

  async addMembers(
    groupId: number,
    memberUids: number[],
    role: string | undefined,
    _user: SessionUser
  ): Promise<{
    result: Record<string, unknown>;
    add_members: GroupMember[];
    exist_members: GroupMember[];
    no_members: number[];
  }> {
    const group = await this.requireGroup(groupId);
    const normalizedRole = this.normalizeRole(role, 'dev');
    const members = Array.isArray(group.members) ? (group.members as GroupMember[]) : [];

    const addMembers: GroupMember[] = [];
    const existMembers: GroupMember[] = [];
    const noMembers: number[] = [];

    const uniqueUids = Array.from(new Set(memberUids.filter(uid => Number.isFinite(uid))));
    for (const uid of uniqueUids) {
      const userdata = await this.getUserdata(uid, normalizedRole);
      const exists = members.some(member => Number(member.uid) === uid);
      if (exists) {
        if (userdata) {
          existMembers.push(userdata);
        }
        continue;
      }
      if (!userdata) {
        noMembers.push(uid);
        continue;
      }
      if (userdata._role !== 'admin') {
        delete userdata._role;
        addMembers.push(userdata);
      }
    }

    let result: Record<string, unknown> = {
      acknowledged: true,
      matchedCount: 1,
      modifiedCount: 0
    };
    if (addMembers.length > 0) {
      const write = await this.groupModel.updateOne(
        { _id: groupId },
        {
          $push: {
            members: {
              $each: addMembers.map(member => ({
                uid: member.uid,
                role: (member.role as 'owner' | 'dev' | 'guest') || 'dev',
                username: member.username,
                email: member.email
              }))
            }
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

  async changeMemberRole(
    groupId: number,
    memberUid: number,
    role: string | undefined,
    user: SessionUser
  ): Promise<Record<string, unknown>> {
    const group = await this.requireGroup(groupId);
    const exists = (Array.isArray(group.members) ? group.members : []).some(
      member => Number(member.uid) === memberUid
    );
    if (!exists) {
      throw new Error('分组成员不存在');
    }
    await this.ensureDanger(group, user);
    const normalizedRole = this.normalizeRole(role, 'dev');
    const result = await this.groupModel.updateOne(
      {
        _id: groupId,
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

  async delMember(groupId: number, memberUid: number, user: SessionUser): Promise<Record<string, unknown>> {
    const group = await this.requireGroup(groupId);
    const exists = (Array.isArray(group.members) ? group.members : []).some(
      member => Number(member.uid) === memberUid
    );
    if (!exists) {
      throw new Error('分组成员不存在');
    }
    await this.ensureDanger(group, user);
    const result = await this.groupModel.updateOne(
      { _id: groupId },
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

  async delGroup(groupId: number, user: SessionUser): Promise<Record<string, unknown>> {
    if (user.role !== 'admin') {
      throw new Error('没有权限');
    }
    await this.requireGroup(groupId);

    const projects = await this.projectModel.find({ group_id: groupId }).select('_id').lean();
    const projectIds = projects
      .map(item => Number(item._id))
      .filter(item => Number.isFinite(item));

    const [
      interfaceResult,
      interfaceCaseResult,
      interfaceColResult,
      interfaceCatResult,
      tokenResult,
      followResult,
      projectResult,
      groupResult
    ] = await Promise.all([
      projectIds.length > 0
        ? this.interfaceModel.deleteMany({ project_id: { $in: projectIds } })
        : Promise.resolve({ acknowledged: true, deletedCount: 0 }),
      projectIds.length > 0
        ? this.interfaceCaseModel.deleteMany({ project_id: { $in: projectIds } })
        : Promise.resolve({ acknowledged: true, deletedCount: 0 }),
      projectIds.length > 0
        ? this.interfaceColModel.deleteMany({ project_id: { $in: projectIds } })
        : Promise.resolve({ acknowledged: true, deletedCount: 0 }),
      projectIds.length > 0
        ? this.interfaceCatModel.deleteMany({ project_id: { $in: projectIds } })
        : Promise.resolve({ acknowledged: true, deletedCount: 0 }),
      projectIds.length > 0
        ? this.tokenModel.deleteMany({ project_id: { $in: projectIds } })
        : Promise.resolve({ acknowledged: true, deletedCount: 0 }),
      projectIds.length > 0
        ? this.followModel.deleteMany({ projectid: { $in: projectIds } })
        : Promise.resolve({ acknowledged: true, deletedCount: 0 }),
      this.projectModel.deleteMany({ group_id: groupId }),
      this.groupModel.deleteOne({ _id: groupId })
    ]);

    return {
      acknowledged:
        interfaceResult.acknowledged &&
        interfaceCaseResult.acknowledged &&
        interfaceColResult.acknowledged &&
        interfaceCatResult.acknowledged &&
        tokenResult.acknowledged &&
        followResult.acknowledged &&
        projectResult.acknowledged &&
        groupResult.acknowledged,
      deleted: {
        group: groupResult.deletedCount || 0,
        project: projectResult.deletedCount || 0,
        interface: interfaceResult.deletedCount || 0,
        interface_case: interfaceCaseResult.deletedCount || 0,
        interface_col: interfaceColResult.deletedCount || 0,
        interface_cat: interfaceCatResult.deletedCount || 0,
        token: tokenResult.deletedCount || 0,
        follow: followResult.deletedCount || 0
      }
    };
  }

  private async getOrCreatePrivateGroup(user: SessionUser): Promise<GroupEntity> {
    let privateGroup = await this.groupModel
      .findOne({ uid: user._id, type: 'private' })
      .select('group_name _id group_desc add_time up_time type uid custom_field1 members')
      .lean();
    if (privateGroup) return privateGroup;

    const id = await this.counterService.next('group', '_id', 11);
    const now = this.now();
    const payload: GroupEntity = {
      _id: id,
      uid: user._id,
      group_name: `User-${user._id}`,
      group_desc: '',
      type: 'private',
      members: [],
      custom_field1: {
        name: '',
        enable: false
      },
      add_time: now,
      up_time: now
    };
    await this.groupModel.create(payload);
    privateGroup = await this.groupModel
      .findOne({ _id: id })
      .select('group_name _id group_desc add_time up_time type uid custom_field1 members')
      .lean();
    return privateGroup as GroupEntity;
  }

  private attachRole(group: GroupEntity, user: SessionUser): Record<string, unknown> {
    return {
      ...group,
      role: this.resolveRoleFromGroup(group, user)
    };
  }

  private resolveRoleFromGroup(group: GroupEntity, user: SessionUser): string {
    if (user.role === 'admin') return 'admin';
    if (group.uid === user._id) return 'owner';
    const members = Array.isArray(group.members) ? (group.members as GroupMember[]) : [];
    const found = members.find(member => Number(member?.uid) === user._id);
    if (found?.role === 'owner') return 'owner';
    if (found?.role === 'dev') return 'dev';
    if (found?.role === 'guest') return 'guest';
    return 'member';
  }

  private async ensureDanger(group: GroupEntity, user: SessionUser): Promise<void> {
    const role = this.resolveRoleFromGroup(group, user);
    if (role === 'admin' || role === 'owner') return;
    throw new Error('没有权限');
  }

  private normalizeRole(input: string | undefined, fallback: 'owner' | 'dev' | 'guest'): 'owner' | 'dev' | 'guest' {
    const value = (input || '').toLowerCase();
    if (value === 'owner' || value === 'dev' || value === 'guest') {
      return value;
    }
    return fallback;
  }

  private async requireGroup(groupId: number): Promise<GroupEntity> {
    const group = await this.groupModel.findOne({ _id: groupId }).lean();
    if (!group) {
      throw new NotFoundException('分组不存在');
    }
    return group;
  }

  private async getUserdata(uid: number, role: 'owner' | 'dev' | 'guest'): Promise<GroupMember | null> {
    const userData = await this.userModel.findOne({ _id: uid }).lean();
    if (!userData) return null;
    return {
      _role: userData.role,
      role,
      uid: userData._id,
      username: userData.username,
      email: userData.email
    };
  }

  private now(): number {
    return Math.floor(Date.now() / 1000);
  }
}
