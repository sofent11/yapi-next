import { Alert, Button, Input, Select, Space, Typography } from 'antd';
import { SectionCard } from '../../../components/layout';

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
  onClearResponse: () => void;
};

export function InterfaceRunTab(props: InterfaceRunTabProps) {
  return (
    <div className="legacy-interface-run-tab">
      <SectionCard title="请求调试" className="legacy-run-card">
        <Space wrap style={{ width: '100%' }} className="legacy-run-toolbar">
          <Select
            value={props.runMethod}
            onChange={props.onSetRunMethod}
            style={{ width: 120 }}
            options={props.runMethods.map(item => ({ label: item, value: item }))}
          />
          <Input
            value={props.runPath}
            onChange={event => props.onSetRunPath(event.target.value)}
            style={{ minWidth: 260, flex: 1 }}
            placeholder="/api/example"
          />
          <Button type="primary" loading={props.runLoading} onClick={props.onRun}>
            发送请求
          </Button>
          <Button onClick={props.onClearResponse} disabled={!props.runResponse}>
            清空响应
          </Button>
        </Space>
        <Alert type="info" showIcon message="调试请求参数需使用 JSON 格式" />
      </SectionCard>

      <SectionCard title="请求参数" className="legacy-run-card">
        <div className="legacy-run-editor-grid">
          <div className="legacy-run-editor-block">
            <Text strong>Query</Text>
            <Input.TextArea
              rows={6}
              value={props.runQuery}
              onChange={event => props.onSetRunQuery(event.target.value)}
            />
          </div>
          <div className="legacy-run-editor-block">
            <Text strong>Headers</Text>
            <Input.TextArea
              rows={6}
              value={props.runHeaders}
              onChange={event => props.onSetRunHeaders(event.target.value)}
            />
          </div>
          <div className="legacy-run-editor-block legacy-run-editor-block-wide">
            <Text strong>Body</Text>
            <Input.TextArea
              rows={8}
              value={props.runBody}
              onChange={event => props.onSetRunBody(event.target.value)}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="响应结果" className="legacy-run-card">
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
