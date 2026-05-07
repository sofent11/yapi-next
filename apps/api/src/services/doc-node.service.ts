import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { CounterService } from './counter.service';
import { GroupCompatService } from './group-compat.service';
import { ProjectCompatService } from './project-compat.service';
import { SessionUser } from './session-auth.service';
import { DocNodeEntity, DocNodeType, DocScopeType } from '../database/schemas/doc-node.schema';

type DocScopeInput = {
  scope_type: DocScopeType;
  group_id?: number;
  project_id?: number;
  token?: string;
};

type DocTreeNode = DocNodeEntity & { children: DocTreeNode[] };

type PluginDoc = Record<string, unknown>;

@Injectable()
export class DocNodeService {
  constructor(
    @InjectModel(DocNodeEntity.name)
    private readonly docNodeModel: Model<DocNodeEntity>,
    @InjectConnection()
    private readonly connection: Connection,
    private readonly counterService: CounterService,
    private readonly groupService: GroupCompatService,
    private readonly projectService: ProjectCompatService
  ) {}

  async tree(scope: DocScopeInput, options: { user?: SessionUser | null }): Promise<{
    list: DocTreeNode[];
    can_write: boolean;
  }> {
    const normalized = await this.assertScope(scope, 'view', options);
    await this.ensureLegacyWikiMigrated(normalized, options.user || null);
    const rows = await this.docNodeModel.find(this.scopeFilter(normalized)).sort({ parent_id: 1, index: 1, _id: 1 }).lean();
    const canWrite = await this.canWrite(normalized, options.user || null);
    return {
      list: this.buildTree(rows),
      can_write: canWrite
    };
  }

  async add(
    payload: DocScopeInput & { parent_id?: number; node_type: DocNodeType; title: string; markdown?: string },
    user: SessionUser
  ): Promise<DocNodeEntity> {
    const scope = await this.assertScope(payload, 'edit', { user });
    const parentId = Number(payload.parent_id || 0);
    if (parentId > 0) {
      await this.requireParent(scope, parentId);
    }
    const nodeType = payload.node_type === 'folder' ? 'folder' : 'page';
    const title = this.normalizeTitle(payload.title);
    const id = await this.counterService.next('doc_node', '_id', 11);
    const now = this.now();
    const index = await this.nextIndex(scope, parentId);
    const doc: DocNodeEntity = {
      _id: id,
      scope_type: scope.scope_type,
      group_id: scope.group_id || 0,
      project_id: scope.project_id || 0,
      parent_id: parentId,
      node_type: nodeType,
      title,
      markdown: nodeType === 'page' ? String(payload.markdown || '') : '',
      index,
      uid: user._id,
      edit_uid: user._id,
      add_time: now,
      up_time: now
    };
    await this.docNodeModel.create(doc);
    return doc;
  }

  async update(
    id: number,
    payload: { title?: string; markdown?: string; parent_id?: number; index?: number },
    user: SessionUser
  ): Promise<DocNodeEntity> {
    const node = await this.requireNode(id);
    const scope = this.scopeFromNode(node);
    await this.assertScope(scope, 'edit', { user });
    const data: Partial<DocNodeEntity> = {
      edit_uid: user._id,
      up_time: this.now()
    };
    if (typeof payload.title === 'string') {
      data.title = this.normalizeTitle(payload.title);
    }
    if (typeof payload.markdown === 'string' && node.node_type === 'page') {
      data.markdown = payload.markdown;
    }
    if (typeof payload.parent_id === 'number') {
      await this.assertMoveTarget(scope, node._id, payload.parent_id);
      data.parent_id = payload.parent_id;
    }
    if (typeof payload.index === 'number' && Number.isFinite(payload.index)) {
      data.index = Math.max(0, Math.floor(payload.index));
    }
    await this.docNodeModel.updateOne({ _id: id }, { $set: data });
    return this.requireNode(id);
  }

  async move(id: number, parentId: number, index: number | undefined, user: SessionUser): Promise<DocNodeEntity> {
    const node = await this.requireNode(id);
    const scope = this.scopeFromNode(node);
    await this.assertScope(scope, 'edit', { user });
    await this.assertMoveTarget(scope, node._id, parentId);
    await this.docNodeModel.updateOne(
      { _id: id },
      {
        $set: {
          parent_id: parentId,
          index: typeof index === 'number' && Number.isFinite(index) ? Math.max(0, Math.floor(index)) : await this.nextIndex(scope, parentId),
          edit_uid: user._id,
          up_time: this.now()
        }
      }
    );
    return this.requireNode(id);
  }

  async del(id: number, user: SessionUser): Promise<{ acknowledged: boolean; deletedCount: number }> {
    const node = await this.requireNode(id);
    const scope = this.scopeFromNode(node);
    await this.assertScope(scope, 'edit', { user });
    const ids = await this.collectDescendantIds(scope, id);
    ids.push(id);
    const result = await this.docNodeModel.deleteMany({ _id: { $in: ids } });
    return {
      acknowledged: result.acknowledged,
      deletedCount: result.deletedCount
    };
  }

  private async assertScope(
    input: DocScopeInput,
    action: 'view' | 'edit',
    options: { user?: SessionUser | null }
  ): Promise<Required<Pick<DocScopeInput, 'scope_type'>> & { group_id?: number; project_id?: number; token?: string }> {
    if (input.scope_type === 'project') {
      const projectId = Number(input.project_id || 0);
      if (!projectId) {
        throw new Error('project_id不能为空');
      }
      await this.projectService.assertProjectPermission(projectId, action, {
        user: options.user || null,
        token: action === 'view' ? input.token : undefined
      });
      return {
        scope_type: 'project',
        project_id: projectId,
        group_id: 0,
        token: input.token
      };
    }
    if (input.scope_type === 'group') {
      const groupId = Number(input.group_id || 0);
      if (!groupId) {
        throw new Error('group_id不能为空');
      }
      if (!options.user) {
        throw new ForbiddenException('没有权限');
      }
      await this.groupService.assertGroupPermission(groupId, action, options.user);
      return {
        scope_type: 'group',
        group_id: groupId,
        project_id: 0
      };
    }
    throw new Error('scope_type无效');
  }

  private async canWrite(scope: DocScopeInput, user: SessionUser | null): Promise<boolean> {
    if (!user) return false;
    try {
      await this.assertScope(scope, 'edit', { user });
      return true;
    } catch (_err) {
      return false;
    }
  }

  private scopeFilter(scope: DocScopeInput): Record<string, unknown> {
    if (scope.scope_type === 'project') {
      return { scope_type: 'project', project_id: Number(scope.project_id || 0) };
    }
    return { scope_type: 'group', group_id: Number(scope.group_id || 0) };
  }

  private scopeFromNode(node: DocNodeEntity): DocScopeInput {
    return {
      scope_type: node.scope_type,
      group_id: Number(node.group_id || 0),
      project_id: Number(node.project_id || 0)
    };
  }

  private async requireNode(id: number): Promise<DocNodeEntity> {
    const node = await this.docNodeModel.findOne({ _id: id }).lean();
    if (!node) {
      throw new NotFoundException('文档不存在');
    }
    return node;
  }

  private async requireParent(scope: DocScopeInput, parentId: number): Promise<DocNodeEntity> {
    const parent = await this.docNodeModel.findOne({ ...this.scopeFilter(scope), _id: parentId }).lean();
    if (!parent || parent.node_type !== 'folder') {
      throw new Error('父级目录不存在');
    }
    return parent;
  }

  private async assertMoveTarget(scope: DocScopeInput, nodeId: number, parentId: number): Promise<void> {
    if (parentId <= 0) return;
    const parent = await this.requireParent(scope, parentId);
    if (parent._id === nodeId) {
      throw new Error('不能移动到自身下');
    }
    let cursor = parent;
    while (cursor.parent_id > 0) {
      if (cursor.parent_id === nodeId) {
        throw new Error('不能移动到子节点下');
      }
      cursor = await this.requireParent(scope, cursor.parent_id);
    }
  }

  private async nextIndex(scope: DocScopeInput, parentId: number): Promise<number> {
    const last = await this.docNodeModel
      .findOne({ ...this.scopeFilter(scope), parent_id: parentId })
      .sort({ index: -1, _id: -1 })
      .select('index')
      .lean();
    return Number(last?.index || 0) + 1;
  }

  private buildTree(rows: DocNodeEntity[]): DocTreeNode[] {
    const map = new Map<number, DocTreeNode>();
    rows.forEach(row => {
      map.set(row._id, {
        ...row,
        children: []
      });
    });
    const roots: DocTreeNode[] = [];
    map.forEach(node => {
      const parentId = Number(node.parent_id || 0);
      const parent = parentId > 0 ? map.get(parentId) : null;
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    });
    const sortNodes = (items: DocTreeNode[]) => {
      items.sort((left, right) => (left.index || 0) - (right.index || 0) || left._id - right._id);
      items.forEach(item => sortNodes(item.children));
    };
    sortNodes(roots);
    return roots;
  }

  private async collectDescendantIds(scope: DocScopeInput, parentId: number): Promise<number[]> {
    const children = await this.docNodeModel.find({ ...this.scopeFilter(scope), parent_id: parentId }).select('_id').lean();
    const ids = children.map(item => Number(item._id)).filter(item => Number.isFinite(item));
    for (const id of ids.slice()) {
      ids.push(...(await this.collectDescendantIds(scope, id)));
    }
    return ids;
  }

  private async ensureLegacyWikiMigrated(scope: DocScopeInput, user: SessionUser | null): Promise<void> {
    if (scope.scope_type !== 'project' || !scope.project_id) return;
    const existed = await this.docNodeModel.exists(this.scopeFilter(scope));
    if (existed) return;
    const wikiDoc = await this.connection.collection<PluginDoc>('wiki').findOne({ project_id: scope.project_id });
    const markdown = wikiDoc ? String(wikiDoc.markdown || wikiDoc.desc || '') : '';
    if (!markdown.trim()) return;
    const id = await this.counterService.next('doc_node', '_id', 11);
    const now = this.now();
    await this.docNodeModel.create({
      _id: id,
      scope_type: 'project',
      group_id: 0,
      project_id: scope.project_id,
      parent_id: 0,
      node_type: 'page',
      title: '项目 Wiki',
      markdown,
      index: 1,
      uid: Number(wikiDoc?.uid || user?._id || 0),
      edit_uid: Number(wikiDoc?.edit_uid || wikiDoc?.uid || user?._id || 0),
      add_time: Number(wikiDoc?.add_time || now),
      up_time: Number(wikiDoc?.up_time || now)
    });
  }

  private normalizeTitle(title: string): string {
    const value = String(title || '').trim();
    if (!value) {
      throw new Error('标题不能为空');
    }
    if (value.length > 120) {
      return value.slice(0, 120);
    }
    return value;
  }

  private now(): number {
    return Math.floor(Date.now() / 1000);
  }
}
