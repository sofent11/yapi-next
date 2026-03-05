import { Alert, Button, Input, Select, Space, Typography } from 'antd';
import { ClearOutlined, CopyOutlined, FormatPainterOutlined } from '@ant-design/icons';
import { SectionCard } from '../../../components/layout';
import { getHttpMethodBadgeClassName } from '../../../utils/http-method';

const { Text } = Typography;

type InterfaceRunTabProps = {
  runMethod: string;
  runPath: string;
  runQuery: string;
  runHeaders: string;
  runBody: string;
  runResponse: string;
  runLoading: boolean;
  runMethods: readonly string[];
  onSetRunMethod: (value: string) => void;
  onSetRunPath: (value: string) => void;
  onSetRunQuery: (value: string) => void;
  onSetRunHeaders: (value: string) => void;
  onSetRunBody: (value: string) => void;
  onRun: () => void;
  onFormatRunQuery: () => void;
  onFormatRunHeaders: () => void;
  onFormatRunBody: () => void;
  onCopyRunQuery: () => void;
  onCopyRunHeaders: () => void;
  onCopyRunBody: () => void;
  onClearRunQuery: () => void;
  onClearRunHeaders: () => void;
  onClearRunBody: () => void;
  onCopyRunResponse: () => void;
  onClearResponse: () => void;
};

export function InterfaceRunTab(props: InterfaceRunTabProps) {
  const methodSelectOptions = props.runMethods.map(item => ({
    value: item,
    label: <span className={getHttpMethodBadgeClassName(item)}>{item}</span>
  }));

  return (
    <div className="legacy-interface-run-tab">
      <SectionCard title="请求调试" className="legacy-run-card">
        <Space wrap className="legacy-run-toolbar">
          <Select
            value={props.runMethod}
            onChange={props.onSetRunMethod}
            className="legacy-run-method-select"
            options={methodSelectOptions}
          />
          <Input
            value={props.runPath}
            onChange={event => props.onSetRunPath(event.target.value)}
            className="legacy-run-path-input"
            placeholder="/api/example"
          />
          <Button type="primary" loading={props.runLoading} onClick={props.onRun}>
            发送请求
          </Button>
          <Button onClick={props.onClearResponse} disabled={!props.runResponse}>
            清空响应
          </Button>
        </Space>
        <Alert className="legacy-run-format-alert" type="info" showIcon message="调试请求参数需使用 JSON 格式" />
      </SectionCard>

      <SectionCard title="请求参数" className="legacy-run-card">
        <div className="legacy-run-editor-grid">
          <div className="legacy-run-editor-block">
            <div className="legacy-run-section-head">
              <Text strong>Query</Text>
              <Space size={4} className="legacy-run-section-actions">
                <Button size="small" icon={<FormatPainterOutlined />} onClick={props.onFormatRunQuery}>
                  格式化
                </Button>
                <Button size="small" icon={<CopyOutlined />} onClick={props.onCopyRunQuery}>
                  复制
                </Button>
                <Button size="small" icon={<ClearOutlined />} onClick={props.onClearRunQuery}>
                  清空
                </Button>
              </Space>
            </div>
            <Input.TextArea
              rows={6}
              value={props.runQuery}
              onChange={event => props.onSetRunQuery(event.target.value)}
            />
          </div>
          <div className="legacy-run-editor-block">
            <div className="legacy-run-section-head">
              <Text strong>Headers</Text>
              <Space size={4} className="legacy-run-section-actions">
                <Button size="small" icon={<FormatPainterOutlined />} onClick={props.onFormatRunHeaders}>
                  格式化
                </Button>
                <Button size="small" icon={<CopyOutlined />} onClick={props.onCopyRunHeaders}>
                  复制
                </Button>
                <Button size="small" icon={<ClearOutlined />} onClick={props.onClearRunHeaders}>
                  清空
                </Button>
              </Space>
            </div>
            <Input.TextArea
              rows={6}
              value={props.runHeaders}
              onChange={event => props.onSetRunHeaders(event.target.value)}
            />
          </div>
          <div className="legacy-run-editor-block legacy-run-editor-block-wide">
            <div className="legacy-run-section-head">
              <Text strong>Body</Text>
              <Space size={4} className="legacy-run-section-actions">
                <Button size="small" icon={<FormatPainterOutlined />} onClick={props.onFormatRunBody}>
                  格式化
                </Button>
                <Button size="small" icon={<CopyOutlined />} onClick={props.onCopyRunBody}>
                  复制
                </Button>
                <Button size="small" icon={<ClearOutlined />} onClick={props.onClearRunBody}>
                  清空
                </Button>
              </Space>
            </div>
            <Input.TextArea
              rows={8}
              value={props.runBody}
              onChange={event => props.onSetRunBody(event.target.value)}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="响应结果" className="legacy-run-card">
        <div className="legacy-run-section-head">
          <Text strong>Response</Text>
          <Space size={4} className="legacy-run-section-actions">
            <Button size="small" icon={<CopyOutlined />} onClick={props.onCopyRunResponse} disabled={!props.runResponse}>
              复制
            </Button>
            <Button size="small" icon={<ClearOutlined />} onClick={props.onClearResponse} disabled={!props.runResponse}>
              清空
            </Button>
          </Space>
        </div>
        <Input.TextArea
          rows={14}
          value={props.runResponse}
          readOnly
          placeholder="点击“发送请求”后显示结果"
        />
      </SectionCard>
    </div>
  );
}
