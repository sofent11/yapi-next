import { Button, Input, Select, Space, Switch, Tooltip } from 'antd';
import {
  DownOutlined,
  FileTextOutlined,
  PlusOutlined,
  RightOutlined,
  UploadOutlined
} from '@ant-design/icons';

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
        <div className="legacy-schema-editor-head-name">
          <Button
            type="text"
            size="small"
            className="legacy-schema-editor-toggle-btn"
            icon={rootCollapsed ? <RightOutlined /> : <DownOutlined />}
            onClick={onToggleRootCollapse}
          />
          <Input value="root" readOnly />
        </div>
        <Switch size="small" checked={false} disabled />
        <Select value="object" disabled options={[{ value: 'object', label: 'object' }]} />
        <Input value="mock" disabled />
        <Input value="description" disabled />
        <Space size={0}>
          <Tooltip title="导入 JSON 生成 Schema">
            <Button type="text" icon={<UploadOutlined />} onClick={onImportJson} />
          </Tooltip>
          <Tooltip title="查看/编辑 Schema 文件">
            <Button type="text" icon={<FileTextOutlined />} onClick={onOpenSchema} />
          </Tooltip>
          <Tooltip title="添加子节点">
            <Button type="text" icon={<PlusOutlined />} onClick={onAddTopRow} />
          </Tooltip>
        </Space>
      </div>
    </div>
  );
}
