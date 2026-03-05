import { DownOutlined, ExclamationCircleOutlined, QuestionCircleOutlined, UpOutlined } from '@ant-design/icons';
import { Button, Form, Input, Space, Switch, Tooltip, Typography } from 'antd';
import type { FormInstance } from 'antd';

const { Text } = Typography;

export type GroupSettingForm = {
  group_name: string;
  group_desc?: string;
  owner_uids?: number[];
  owner_uids_text?: string;
  custom_field1_name?: string;
  custom_field1_enable?: boolean;
};

type ProjectConsoleSettingTabProps = {
  form: FormInstance<GroupSettingForm>;
  selectedGroupName: string;
  customFieldRule: boolean;
  updateLoading: boolean;
  canDeleteGroup: boolean;
  showDangerOptions: boolean;
  dangerConfirmName: string;
  dangerConfirmMatched: boolean;
  deleteLoading: boolean;
  onSave: (values: GroupSettingForm) => void;
  onToggleDanger: () => void;
  onDangerConfirmNameChange: (value: string) => void;
  onDeleteGroup: () => void;
};

export function ProjectConsoleSettingTab(props: ProjectConsoleSettingTabProps) {
  return (
    <div className="m-panel group-setting-pane">
      <Form<GroupSettingForm> form={props.form} layout="vertical" onFinish={props.onSave}>
        <Form.Item label="分组名称" name="group_name" rules={[{ required: true, message: '请输入分组名称' }]}>
          <Input />
        </Form.Item>
        <Form.Item label="分组简介" name="group_desc">
          <Input.TextArea rows={4} />
        </Form.Item>
        <Form.Item label="接口自定义字段">
          <Space align="start" className="legacy-console-custom-field-row">
            <Form.Item noStyle name="custom_field1_name">
              <Input
                placeholder="请输入自定义字段名称"
                status={props.customFieldRule ? 'error' : ''}
                className="legacy-console-custom-field-input"
              />
            </Form.Item>
            <Tooltip title="可以在接口中添加额外字段数据">
              <QuestionCircleOutlined className="legacy-console-custom-field-help" />
            </Tooltip>
            <Form.Item noStyle name="custom_field1_enable" valuePropName="checked">
              <Switch checkedChildren="开" unCheckedChildren="关" />
            </Form.Item>
          </Space>
          {props.customFieldRule ? <div className="legacy-field-error">自定义字段名称不能为空</div> : null}
        </Form.Item>
        <div className="legacy-console-setting-submit">
          <Button type="primary" htmlType="submit" loading={props.updateLoading}>保存设置</Button>
        </div>
      </Form>

      {props.canDeleteGroup ? (
        <div className="group-danger-zone legacy-console-danger-zone">
          <div className="legacy-console-danger-head">
            <span className="legacy-console-danger-title">
              <ExclamationCircleOutlined className="legacy-console-danger-icon" />
              危险操作
            </span>
            <Button onClick={props.onToggleDanger}>
              {props.showDangerOptions ? '收起' : '查看'} {props.showDangerOptions ? <UpOutlined /> : <DownOutlined />}
            </Button>
          </div>
          {props.showDangerOptions ? (
            <div className="legacy-console-danger-content">
              <div className="legacy-console-danger-desc">
                分组删除后将移除分组下所有项目及接口，请谨慎操作。仅管理员可执行该操作。
              </div>
              <div className="legacy-console-danger-confirm-path">
                <Text type="secondary">
                  请输入分组名 <Text code>{props.selectedGroupName || '-'}</Text> 以确认删除
                </Text>
                <Input
                  value={props.dangerConfirmName}
                  onChange={event => props.onDangerConfirmNameChange(event.target.value)}
                  placeholder={`请输入 ${props.selectedGroupName || '分组名'}`}
                  className="legacy-console-danger-confirm-input"
                />
                <Text
                  type={props.dangerConfirmName.trim() && !props.dangerConfirmMatched ? 'danger' : 'secondary'}
                  className="legacy-console-danger-confirm-hint"
                >
                  {props.dangerConfirmName.trim()
                    ? props.dangerConfirmMatched
                      ? '分组名称校验通过，可继续删除'
                      : '分组名称不匹配，暂不可删除'
                    : '输入完成后可点击删除分组'}
                </Text>
              </div>
              <Button
                danger
                onClick={props.onDeleteGroup}
                loading={props.deleteLoading}
                disabled={!props.dangerConfirmMatched}
              >
                删除分组
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
