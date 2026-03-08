import { ActionIcon, Select, Switch, TextInput, Tooltip } from '@mantine/core';
import {
  IconChevronDown,
  IconChevronRight,
  IconFileText,
  IconPlus,
  IconUpload
} from '@tabler/icons-react';

type Props = {
  rootCollapsed: boolean;
  onToggleRootCollapse: () => void;
  onImportJson: () => void;
  onOpenSchema: () => void;
  onAddTopRow: () => void;
};

export function SchemaEditorHeader({
  rootCollapsed,
  onToggleRootCollapse,
  onImportJson,
  onOpenSchema,
  onAddTopRow
}: Props) {
  return (
    <div className="schema-editor-head">
      <div className="schema-editor-head-grid">
        <div className="schema-editor-head-name flex items-center gap-2">
          <ActionIcon
            variant="subtle"
            size="sm"
            className="schema-editor-toggle-button dark:!border-transparent dark:!bg-transparent dark:!text-slate-400 dark:hover:!border-[var(--border-project-subtle)] dark:hover:!bg-[var(--surface-project-elevated)] dark:hover:!text-slate-100"
            onClick={onToggleRootCollapse}
            aria-label={rootCollapsed ? '展开 root 节点' : '收起 root 节点'}
          >
            {rootCollapsed ? <IconChevronRight size={16} /> : <IconChevronDown size={16} />}
          </ActionIcon>
          <TextInput className="schema-editor-root-name" value="root" readOnly />
        </div>
        <div className="flex items-center">
          <Switch className="schema-editor-required-switch" size="sm" checked={false} disabled />
        </div>
        <Select className="schema-editor-root-type" value="object" disabled data={[{ value: 'object', label: 'object' }]} />
        <TextInput className="schema-editor-root-placeholder" value="mock" disabled />
        <TextInput className="schema-editor-root-placeholder" value="description" disabled />
        <div className="schema-editor-head-actions flex items-center gap-1">
          <Tooltip label="导入 JSON 生成 Schema">
            <ActionIcon
              variant="subtle"
              className="dark:!border-transparent dark:!bg-transparent dark:!text-slate-400 dark:hover:!border-[var(--border-project-subtle)] dark:hover:!bg-[var(--surface-project-elevated)] dark:hover:!text-slate-100"
              onClick={onImportJson}
              aria-label="导入 JSON 生成 Schema"
            >
              <IconUpload size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="查看/编辑 Schema 文件">
            <ActionIcon
              variant="subtle"
              className="dark:!border-transparent dark:!bg-transparent dark:!text-slate-400 dark:hover:!border-[var(--border-project-subtle)] dark:hover:!bg-[var(--surface-project-elevated)] dark:hover:!text-slate-100"
              onClick={onOpenSchema}
              aria-label="查看或编辑 Schema 文件"
            >
              <IconFileText size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="添加子节点">
            <ActionIcon
              variant="subtle"
              className="dark:!border-transparent dark:!bg-transparent dark:!text-slate-400 dark:hover:!border-[var(--border-project-subtle)] dark:hover:!bg-[var(--surface-project-elevated)] dark:hover:!text-slate-100"
              onClick={onAddTopRow}
              aria-label="添加根节点子字段"
            >
              <IconPlus size={16} />
            </ActionIcon>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
