import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Divider, Modal, ScrollArea, Text } from '@mantine/core';
import { modals } from '@mantine/modals';
import { IconArrowRight, IconTrash } from '@tabler/icons-react';
import type { InterfaceTreeNode } from '@yapi-next/shared-types';
import {
  buildDuplicateInterfaceGroups,
  type DuplicateInterfaceGroupItem
} from '../ProjectInterfacePage.utils';

type InterfaceDuplicateGovernanceModalProps = {
  opened: boolean;
  onClose: () => void;
  rows: InterfaceTreeNode[];
  onNavigateInterface: (interfaceId: number) => void;
  onDeleteInterfaces: (ids: number[]) => Promise<number[]>;
  onDeleteEmptyCategories: (catIds: number[]) => Promise<number[]>;
};

function DuplicateItemRow(props: {
  item: DuplicateInterfaceGroupItem;
  deleting: boolean;
  onNavigate: (interfaceId: number) => void;
  onDelete: (ids: number[]) => Promise<void>;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-shell-subtle)] px-4 py-3">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge color={props.item.variant === 'short' ? 'teal' : 'orange'} variant="light">
            {props.item.variant === 'short' ? '短路径' : '长路径'}
          </Badge>
          <Badge variant="outline">{props.item.method}</Badge>
          <Text fw={600} className="truncate">
            {props.item.title}
          </Text>
        </div>
        <div className="space-y-1">
          <Text size="sm" c="dimmed">
            分类：{props.item.categoryName}
          </Text>
          <Text size="sm" ff="monospace">
            {props.item.path}
          </Text>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="default" size="compact-sm" onClick={() => props.onNavigate(props.item.id)}>
          查看
        </Button>
        <Button
          color="red"
          variant="light"
          size="compact-sm"
          leftSection={<IconTrash size={14} />}
          loading={props.deleting}
          onClick={() => void props.onDelete([props.item.id])}
        >
          删除
        </Button>
      </div>
    </div>
  );
}

export function InterfaceDuplicateGovernanceModal(props: InterfaceDuplicateGovernanceModalProps) {
  const [hiddenIds, setHiddenIds] = useState<number[]>([]);
  const [deletingIds, setDeletingIds] = useState<number[]>([]);
  const [hiddenCatIds, setHiddenCatIds] = useState<number[]>([]);
  const [deletingCatIds, setDeletingCatIds] = useState<number[]>([]);

  useEffect(() => {
    if (!props.opened) {
      setHiddenIds([]);
      setDeletingIds([]);
      setHiddenCatIds([]);
      setDeletingCatIds([]);
    }
  }, [props.opened]);

  const visibleRows = useMemo(
    () => props.rows.filter(cat => !hiddenCatIds.includes(Number(cat._id || 0)) && !deletingCatIds.includes(Number(cat._id || 0))),
    [deletingCatIds, hiddenCatIds, props.rows]
  );
  const groups = useMemo(
    () => buildDuplicateInterfaceGroups(visibleRows, [...hiddenIds, ...deletingIds]),
    [deletingIds, hiddenIds, visibleRows]
  );
  const longPathIds = useMemo(
    () => groups.flatMap(group => group.longItems.map(item => item.id)),
    [groups]
  );
  const shortPathIds = useMemo(
    () => groups.flatMap(group => group.shortItems.map(item => item.id)),
    [groups]
  );
  const emptyCategories = useMemo(
    () =>
      visibleRows
        .filter(cat => Number(cat.interface_count || cat.list?.length || 0) === 0)
        .map(cat => ({
          id: Number(cat._id || 0),
          name: String(cat.name || '未命名分类'),
          desc: String((cat as unknown as { desc?: string }).desc || '')
        }))
        .filter(cat => cat.id > 0),
    [visibleRows]
  );
  const emptyCategoryIds = useMemo(() => emptyCategories.map(cat => cat.id), [emptyCategories]);

  const deleteIds = useCallback(
    async (ids: number[]) => {
      const targetIds = Array.from(new Set(ids.map(item => Number(item || 0)).filter(item => item > 0)));
      if (targetIds.length === 0) return;
      setDeletingIds(prev => Array.from(new Set([...prev, ...targetIds])));
      try {
        const deletedIds = await props.onDeleteInterfaces(targetIds);
        if (deletedIds.length > 0) {
          setHiddenIds(prev => Array.from(new Set([...prev, ...deletedIds])));
        }
      } finally {
        setDeletingIds(prev => prev.filter(item => !targetIds.includes(item)));
      }
    },
    [props]
  );

  const deleteEmptyCategories = useCallback(
    async (catIds: number[]) => {
      const targetCatIds = Array.from(new Set(catIds.map(item => Number(item || 0)).filter(item => item > 0)));
      if (targetCatIds.length === 0) return;
      setDeletingCatIds(prev => Array.from(new Set([...prev, ...targetCatIds])));
      try {
        const deletedCatIds = await props.onDeleteEmptyCategories(targetCatIds);
        if (deletedCatIds.length > 0) {
          setHiddenCatIds(prev => Array.from(new Set([...prev, ...deletedCatIds])));
        }
      } finally {
        setDeletingCatIds(prev => prev.filter(item => !targetCatIds.includes(item)));
      }
    },
    [props]
  );

  const openBatchDeleteConfirm = useCallback(
    (mode: 'long' | 'short') => {
      const ids = mode === 'long' ? longPathIds : shortPathIds;
      if (ids.length === 0) return;
      modals.openConfirmModal({
        title: mode === 'long' ? '批量删除长路径接口' : '批量删除短路径接口',
        children:
          mode === 'long'
            ? `将删除 ${ids.length} 个长路径接口，等于为所有重复组统一保留短路径。删除后无法恢复。`
            : `将删除 ${ids.length} 个短路径接口，等于为所有重复组统一保留长路径。删除后无法恢复。`,
        labels: {
          confirm: mode === 'long' ? '确认删除长路径' : '确认删除短路径',
          cancel: '取消'
        },
        confirmProps: { color: 'red' },
        onConfirm: async () => {
          await deleteIds(ids);
        }
      });
    },
    [deleteIds, longPathIds, shortPathIds]
  );

  const openDeleteEmptyCategoriesConfirm = useCallback(() => {
    if (emptyCategoryIds.length === 0) return;
    modals.openConfirmModal({
      title: '批量删除空分类',
      children: `将删除 ${emptyCategoryIds.length} 个没有接口的空分类。删除后无法恢复。`,
      labels: { confirm: '确认删除空分类', cancel: '取消' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        await deleteEmptyCategories(emptyCategoryIds);
      }
    });
  }, [deleteEmptyCategories, emptyCategoryIds]);

  return (
    <Modal
      opened={props.opened}
      onClose={props.onClose}
      title="接口治理"
      size="72rem"
      centered
    >
      <div className="space-y-4">
        <Alert color="blue" variant="light" title="重复判定规则">
          仅当两个接口的 HTTP Method 相同，且 path 尾部完全一致、长路径只比短路径多 1 个前缀段时，才会归为重复。
          例如 `/no-auth/product/page` 和 `/product/page` 会命中，`/product/page` 和 `/sku/page` 不会命中。
        </Alert>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="default"
            onClick={() => openBatchDeleteConfirm('long')}
            disabled={longPathIds.length === 0}
          >
            保留短路径，批量删长路径（{longPathIds.length}）
          </Button>
          <Button
            variant="default"
            onClick={() => openBatchDeleteConfirm('short')}
            disabled={shortPathIds.length === 0}
          >
            保留长路径，批量删短路径（{shortPathIds.length}）
          </Button>
          <Button
            variant="default"
            onClick={openDeleteEmptyCategoriesConfirm}
            disabled={emptyCategoryIds.length === 0}
          >
            清理空分类（{emptyCategoryIds.length}）
          </Button>
          <Text size="sm" c="dimmed">
            共发现 {groups.length} 组重复，涉及 {longPathIds.length + shortPathIds.length} 个接口。
          </Text>
        </div>

        {emptyCategories.length > 0 ? (
          <div className="rounded-[24px] border border-[var(--border-shell-subtle)] bg-[var(--surface-shell-subtle)] px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Text fw={700}>空分类清理</Text>
                <Text size="sm" c="dimmed">
                  当前发现 {emptyCategories.length} 个没有接口的分类，可一键批量删除。
                </Text>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {emptyCategories.map(cat => (
                <Badge key={cat.id} variant="light" color="gray">
                  {cat.name}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        <ScrollArea.Autosize mah={560} offsetScrollbars>
          {groups.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[var(--border-subtle)] px-6 py-10 text-center">
              <Text fw={600}>暂未发现符合规则的重复接口</Text>
              <Text size="sm" c="dimmed" mt={6}>
                当前项目里没有“仅多一个前缀段”的重复 path，或者它们已经被处理掉了。
              </Text>
            </div>
          ) : (
            <div className="space-y-4">
              {groups.map(group => (
                <section
                  key={group.key}
                  className="space-y-3 rounded-[28px] border border-[var(--border-shell-subtle)] bg-white/70 px-4 py-4 dark:bg-[var(--surface-project-subtle)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge color="dark" variant="outline">
                          {group.method}
                        </Badge>
                        <Badge color="blue" variant="light">
                          尾部路径
                        </Badge>
                        <Text fw={700} ff="monospace">
                          {group.shortPath}
                        </Text>
                      </div>
                      <Text size="sm" c="dimmed">
                        短路径 {group.shortItems.length} 条
                        <span className="px-2">•</span>
                        长路径 {group.longItems.length} 条
                      </Text>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                      <IconArrowRight size={16} />
                      手工确认后删除不需要保留的版本
                    </div>
                  </div>

                  <Divider />

                  <div className="space-y-3">
                    {group.items.map(item => (
                      <DuplicateItemRow
                        key={item.id}
                        item={item}
                        deleting={deletingIds.includes(item.id)}
                        onNavigate={props.onNavigateInterface}
                        onDelete={deleteIds}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </ScrollArea.Autosize>
      </div>
    </Modal>
  );
}
