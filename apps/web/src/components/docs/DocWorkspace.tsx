import { useEffect, useMemo, useState } from 'react';
import { ActionIcon, Button, Loader, SegmentedControl, Text, TextInput, Textarea, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconChevronDown,
  IconChevronRight,
  IconDeviceFloppy,
  IconEdit,
  IconEye,
  IconFileText,
  IconFilePlus,
  IconFolder,
  IconFolderPlus,
  IconPencil,
  IconSearch,
  IconTrash,
  IconX
} from '@tabler/icons-react';
import type { DocScopeQuery, DocTreeNode } from '@yapi-next/shared-types';
import {
  useAddDocNodeMutation,
  useDeleteDocNodeMutation,
  useGetDocTreeQuery,
  useMoveDocNodeMutation,
  useUpdateDocNodeMutation
} from '../../services/yapi-api';
import { safeApiRequest } from '../../utils/safe-request';
import { renderMarkdownPreview } from '../../utils/markdown-preview';

type DocWorkspaceProps = {
  scope: DocScopeQuery;
  title: string;
};

type FlatDocNode = DocTreeNode & {
  depth: number;
};

const emptyTree: DocTreeNode[] = [];

const message = {
  success(text: string) {
    notifications.show({ color: 'teal', message: text });
  },
  error(text: string) {
    notifications.show({ color: 'red', message: text });
  }
};

function flattenTree(nodes: DocTreeNode[], expanded: Set<number>, depth = 0): FlatDocNode[] {
  const result: FlatDocNode[] = [];
  nodes.forEach(node => {
    result.push({ ...node, depth });
    if (node.node_type === 'folder' && expanded.has(node._id)) {
      result.push(...flattenTree(node.children || [], expanded, depth + 1));
    }
  });
  return result;
}

function findNode(nodes: DocTreeNode[], id: number): DocTreeNode | null {
  for (const node of nodes) {
    if (node._id === id) return node;
    const child = findNode(node.children || [], id);
    if (child) return child;
  }
  return null;
}

function firstPage(nodes: DocTreeNode[]): DocTreeNode | null {
  for (const node of nodes) {
    if (node.node_type === 'page') return node;
    const child = firstPage(node.children || []);
    if (child) return child;
  }
  return null;
}

function containsNode(nodes: DocTreeNode[], id: number): boolean {
  return nodes.some(node => node._id === id || containsNode(node.children || [], id));
}

function filterTree(nodes: DocTreeNode[], keyword: string): DocTreeNode[] {
  const query = keyword.trim().toLowerCase();
  if (!query) return nodes;
  return nodes
    .map(node => {
      const children = filterTree(node.children || [], keyword);
      const matched = node.title.toLowerCase().includes(query) || node.markdown.toLowerCase().includes(query);
      if (!matched && children.length === 0) return null;
      return {
        ...node,
        children
      };
    })
    .filter(Boolean) as DocTreeNode[];
}

export function DocWorkspace(props: DocWorkspaceProps) {
  const treeQuery = useGetDocTreeQuery(props.scope);
  const [addDocNode, addState] = useAddDocNodeMutation();
  const [updateDocNode, updateState] = useUpdateDocNodeMutation();
  const [deleteDocNode, deleteState] = useDeleteDocNodeMutation();
  const [moveDocNode, moveState] = useMoveDocNodeMutation();
  const nodes = treeQuery.data?.data?.list || emptyTree;
  const canWrite = Boolean(treeQuery.data?.data?.can_write);
  const [activeId, setActiveId] = useState(0);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => new Set());
  const [keyword, setKeyword] = useState('');
  const [titleDraft, setTitleDraft] = useState('');
  const [markdownDraft, setMarkdownDraft] = useState('');
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [renamingId, setRenamingId] = useState(0);
  const [renameDraft, setRenameDraft] = useState('');

  const activeNode = useMemo(() => findNode(nodes, activeId), [nodes, activeId]);
  const dirty = Boolean(activeNode && (titleDraft !== activeNode.title || markdownDraft !== activeNode.markdown));
  const filteredNodes = useMemo(() => filterTree(nodes, keyword), [nodes, keyword]);
  const visibleNodes = useMemo(() => flattenTree(filteredNodes, expandedIds), [filteredNodes, expandedIds]);
  const saving = updateState.isLoading || moveState.isLoading;

  useEffect(() => {
    const folderIds = new Set<number>();
    nodes.forEach(function collect(node) {
      if (node.node_type === 'folder') {
        folderIds.add(node._id);
        (node.children || []).forEach(collect);
      }
    });
    setExpandedIds(previous => new Set([...Array.from(previous), ...Array.from(folderIds)]));
  }, [nodes]);

  useEffect(() => {
    if (activeNode) return;
    const first = firstPage(nodes);
    setActiveId(first?._id || 0);
  }, [activeNode, nodes]);

  useEffect(() => {
    if (!activeNode) {
      setTitleDraft('');
      setMarkdownDraft('');
      return;
    }
    setTitleDraft(activeNode.title);
    setMarkdownDraft(activeNode.markdown || '');
  }, [activeNode?._id]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  function selectNode(node: DocTreeNode) {
    if (node.node_type === 'folder') {
      setExpandedIds(previous => {
        const next = new Set(previous);
        if (next.has(node._id)) {
          next.delete(node._id);
        } else {
          next.add(node._id);
        }
        return next;
      });
      return;
    }
    if (dirty && !window.confirm('当前文档还未保存，确定切换吗？')) return;
    setActiveId(node._id);
  }

  async function handleCreate(nodeType: 'folder' | 'page', parentId = 0) {
    if (!canWrite) return;
    const response = await safeApiRequest(
      addDocNode({
        ...props.scope,
        parent_id: parentId,
        node_type: nodeType,
        title: nodeType === 'folder' ? '新目录' : '新页面',
        markdown: nodeType === 'page' ? '# 新页面\n\n写下这篇文档的内容。' : ''
      }).unwrap(),
      {
        fallback: '创建文档失败',
        onError: text => message.error(text)
      }
    );
    if (!response) return;
    if (nodeType === 'page') {
      setActiveId(Number(response.data?._id || 0));
    } else {
      setExpandedIds(previous => new Set([...Array.from(previous), Number(response.data?._id || 0)]));
    }
    message.success(nodeType === 'folder' ? '目录已创建' : '页面已创建');
  }

  async function handleSave() {
    if (!activeNode || !canWrite) return;
    const response = await safeApiRequest(
      updateDocNode({
        id: activeNode._id,
        title: titleDraft,
        markdown: markdownDraft
      }).unwrap(),
      {
        fallback: '保存文档失败',
        onError: text => message.error(text)
      }
    );
    if (!response) return;
    message.success('文档已保存');
  }

  function startRename(node: DocTreeNode) {
    setRenamingId(node._id);
    setRenameDraft(node.title);
  }

  function cancelRename() {
    setRenamingId(0);
    setRenameDraft('');
  }

  async function commitRename(node: DocTreeNode) {
    if (!canWrite) return;
    const nextTitle = renameDraft.trim();
    if (!nextTitle || nextTitle === node.title) {
      cancelRename();
      return;
    }
    const response = await safeApiRequest(
      updateDocNode({
        id: node._id,
        title: nextTitle
      }).unwrap(),
      {
        fallback: '重命名失败',
        onError: text => message.error(text)
      }
    );
    if (!response) return;
    if (activeId === node._id) {
      setTitleDraft(nextTitle);
    }
    cancelRename();
    message.success('已重命名');
  }

  async function handleDelete(node: DocTreeNode) {
    if (!canWrite) return;
    const text = node.node_type === 'folder' ? '删除目录会同时删除子目录和页面，确定删除吗？' : '确定删除这个页面吗？';
    if (!window.confirm(text)) return;
    const response = await safeApiRequest(deleteDocNode({ id: node._id }).unwrap(), {
      fallback: '删除文档失败',
      onError: value => message.error(value)
    });
    if (!response) return;
    if (activeId === node._id || containsNode(node.children || [], activeId)) {
      setActiveId(0);
    }
    message.success('文档已删除');
  }

  async function handleMove(node: DocTreeNode, direction: -1 | 1) {
    if (!canWrite) return;
    const siblings = visibleNodes.filter(item => item.parent_id === node.parent_id);
    const currentIndex = siblings.findIndex(item => item._id === node._id);
    const target = siblings[currentIndex + direction];
    if (!target) return;
    const response = await safeApiRequest(
      moveDocNode({
        id: node._id,
        parent_id: node.parent_id,
        index: target.index
      }).unwrap(),
      {
        fallback: '移动文档失败',
        onError: value => message.error(value)
      }
    );
    if (!response) return;
    await safeApiRequest(
      moveDocNode({
        id: target._id,
        parent_id: target.parent_id,
        index: node.index
      }).unwrap(),
      {
        fallback: '移动文档失败',
        onError: value => message.error(value)
      }
    );
  }

  const previewHtml = useMemo(() => renderMarkdownPreview(markdownDraft), [markdownDraft]);

  if (treeQuery.isLoading && nodes.length === 0) {
    return (
      <div className="doc-workspace doc-workspace-loading">
        <Loader size="sm" />
        <Text>正在加载文档目录...</Text>
      </div>
    );
  }

  return (
    <div className="doc-workspace">
      <aside className="doc-tree-panel">
        <div className="doc-tree-header">
          <div>
            <Text fw={700}>{props.title}</Text>
            <Text size="xs" c="dimmed">{canWrite ? '可编辑' : '只读'}</Text>
          </div>
          {canWrite ? (
            <div className="doc-tree-actions">
              <Tooltip label="新建目录">
                <ActionIcon variant="subtle" aria-label="新建目录" onClick={() => void handleCreate('folder')}>
                  <IconFolderPlus size={18} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="新建页面">
                <ActionIcon variant="subtle" aria-label="新建页面" onClick={() => void handleCreate('page')}>
                  <IconFilePlus size={18} />
                </ActionIcon>
              </Tooltip>
            </div>
          ) : null}
        </div>
        <TextInput
          value={keyword}
          onChange={event => setKeyword(event.currentTarget.value)}
          leftSection={<IconSearch size={15} />}
          rightSection={
            keyword ? (
              <ActionIcon variant="subtle" aria-label="清空搜索" onClick={() => setKeyword('')}>
                <IconX size={14} />
              </ActionIcon>
            ) : null
          }
          placeholder="搜索文档"
          className="doc-tree-search"
        />
        <div className="doc-tree-list">
          {visibleNodes.length > 0 ? (
            visibleNodes.map(node => {
              const active = node._id === activeId;
              const isFolder = node.node_type === 'folder';
              const renaming = renamingId === node._id;
              return (
                <div key={node._id} className={`doc-tree-row ${active ? 'is-active' : ''}`} style={{ paddingLeft: 10 + node.depth * 18 }}>
                  {renaming ? (
                    <TextInput
                      value={renameDraft}
                      onChange={event => setRenameDraft(event.currentTarget.value)}
                      onBlur={() => void commitRename(node)}
                      onKeyDown={event => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void commitRename(node);
                        }
                        if (event.key === 'Escape') {
                          event.preventDefault();
                          cancelRename();
                        }
                      }}
                      autoFocus
                      className="doc-tree-rename-input"
                      aria-label="重命名文档节点"
                    />
                  ) : (
                    <button type="button" className="doc-tree-main" onClick={() => selectNode(node)}>
                    {isFolder ? (
                      expandedIds.has(node._id) ? <IconChevronDown size={15} /> : <IconChevronRight size={15} />
                    ) : (
                      <IconFileText size={15} />
                    )}
                    <span>{node.title}</span>
                    </button>
                  )}
                  {canWrite ? (
                    <div className="doc-tree-row-actions">
                      {isFolder ? (
                        <ActionIcon size="sm" variant="subtle" aria-label="在目录中新建页面" onClick={() => void handleCreate('page', node._id)}>
                          <IconFilePlus size={14} />
                        </ActionIcon>
                      ) : null}
                      <ActionIcon size="sm" variant="subtle" aria-label="重命名" onClick={() => startRename(node)}>
                        <IconPencil size={14} />
                      </ActionIcon>
                      <ActionIcon size="sm" variant="subtle" aria-label="上移" onClick={() => void handleMove(node, -1)}>
                        <IconChevronDown size={14} className="rotate-180" />
                      </ActionIcon>
                      <ActionIcon size="sm" variant="subtle" aria-label="下移" onClick={() => void handleMove(node, 1)}>
                        <IconChevronDown size={14} />
                      </ActionIcon>
                      <ActionIcon size="sm" variant="subtle" color="red" aria-label="删除" onClick={() => void handleDelete(node)}>
                        <IconTrash size={14} />
                      </ActionIcon>
                    </div>
                  ) : null}
                </div>
              );
            })
          ) : (
            <div className="doc-empty-tree">
              <IconFolder size={22} />
              <Text size="sm">{keyword ? '没有匹配的文档' : '还没有文档'}</Text>
              {canWrite && !keyword ? (
                <Button size="xs" variant="light" onClick={() => void handleCreate('page')} loading={addState.isLoading}>
                  创建第一篇
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </aside>

      <section className="doc-editor-panel">
        {activeNode ? (
          <>
            <div className="doc-editor-toolbar">
              <TextInput
                value={titleDraft}
                onChange={event => setTitleDraft(event.currentTarget.value)}
                readOnly={!canWrite}
                className="doc-title-input"
                aria-label="文档标题"
              />
              <div className="doc-editor-actions">
                <SegmentedControl
                  value={viewMode}
                  onChange={value => setViewMode(value as 'edit' | 'preview')}
                  data={[
                    { label: <span className="doc-mode-label"><IconEdit size={14} /> 编辑</span>, value: 'edit' },
                    { label: <span className="doc-mode-label"><IconEye size={14} /> 预览</span>, value: 'preview' }
                  ]}
                />
                {canWrite ? (
                  <Button
                    leftSection={<IconDeviceFloppy size={16} />}
                    onClick={() => void handleSave()}
                    loading={saving}
                    disabled={!dirty}
                  >
                    保存
                  </Button>
                ) : null}
              </div>
            </div>
            {viewMode === 'edit' && canWrite ? (
              <Textarea
                value={markdownDraft}
                onChange={event => setMarkdownDraft(event.currentTarget.value)}
                className="doc-markdown-editor"
                autosize
                minRows={22}
                aria-label="Markdown 内容"
              />
            ) : (
              <div className="doc-markdown-preview" dangerouslySetInnerHTML={{ __html: previewHtml || '<p>暂无内容</p>' }} />
            )}
          </>
        ) : (
          <div className="doc-empty-editor">
            <IconFilePlus size={28} />
            <Text fw={700}>选择一篇文档</Text>
            <Text size="sm" c="dimmed">目录中的 Markdown 页面会在这里编辑和预览。</Text>
            {canWrite ? (
              <Button variant="light" onClick={() => void handleCreate('page')} loading={addState.isLoading}>
                新建页面
              </Button>
            ) : null}
          </div>
        )}
      </section>
      {deleteState.isLoading ? <span className="sr-only">正在删除</span> : null}
    </div>
  );
}
