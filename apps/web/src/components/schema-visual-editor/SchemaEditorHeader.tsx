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
    <div className="legacy-schema-editor-head-wrap">
      <div className="legacy-schema-editor-head-grid">
        <div className="legacy-schema-editor-head-name flex items-center gap-2">
          <ActionIcon
            variant="subtle"
            size="sm"
            className="legacy-schema-editor-toggle-btn"
            onClick={onToggleRootCollapse}
          >
            {rootCollapsed ? <IconChevronRight size={16} /> : <IconChevronDown size={16} />}
          </ActionIcon>
          <TextInput value="root" readOnly />
        </div>
        <div className="flex items-center">
          <Switch size="sm" checked={false} disabled />
        </div>
        <Select value="object" disabled data={[{ value: 'object', label: 'object' }]} />
        <TextInput value="mock" disabled />
        <TextInput value="description" disabled />
        <div className="flex items-center gap-1">
          <Tooltip label="导入 JSON 生成 Schema">
            <ActionIcon variant="subtle" onClick={onImportJson}>
              <IconUpload size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="查看/编辑 Schema 文件">
            <ActionIcon variant="subtle" onClick={onOpenSchema}>
              <IconFileText size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="添加子节点">
            <ActionIcon variant="subtle" onClick={onAddTopRow}>
              <IconPlus size={16} />
            </ActionIcon>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
