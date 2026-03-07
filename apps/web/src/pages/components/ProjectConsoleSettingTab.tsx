import { Alert, Button, Group, Switch, Text, TextInput, Textarea, Tooltip } from '@mantine/core';
import { IconChevronDown, IconChevronUp, IconExclamationCircle, IconHelpCircle } from '@tabler/icons-react';
import RcForm, { Field } from 'rc-field-form';
import type { FormInstance } from 'rc-field-form';
import { SectionCard } from '../../components/layout';

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
    <SectionCard className="m-panel group-setting-pane">
      <RcForm<GroupSettingForm> form={props.form} onFinish={props.onSave}>
        <div className="space-y-4">
          <Alert
            color="blue"
            className="project-settings-info-alert"
            title="在这里维护分组名称、简介和自定义字段规则，保存后会同步影响该分组下的协作体验。"
          />
          <Field<GroupSettingForm> name="group_name" rules={[{ required: true, message: '请输入分组名称' }]}>
            {(control, meta) => (
              <div>
                <Text mb={6} fw={500}>
                  分组名称
                </Text>
                <TextInput value={control.value} onChange={event => control.onChange(event.currentTarget.value)} />
                {meta.errors[0] ? <div className="field-error-text">{meta.errors[0]}</div> : null}
              </div>
            )}
          </Field>

          <Field<GroupSettingForm> name="group_desc">
            {(control) => (
              <div>
                <Text mb={6} fw={500}>
                  分组简介
                </Text>
                <Textarea rows={4} value={control.value} onChange={event => control.onChange(event.currentTarget.value)} />
              </div>
            )}
          </Field>

          <div>
            <Text mb={6} fw={500}>
              接口自定义字段
            </Text>
            <Group align="start" className="console-settings-custom-field-row">
              <Field<GroupSettingForm> name="custom_field1_name">
                {(control) => (
                  <TextInput
                    value={control.value}
                    onChange={event => control.onChange(event.currentTarget.value)}
                    placeholder="请输入自定义字段名称"
                    error={props.customFieldRule ? '自定义字段名称不能为空' : undefined}
                    className="console-settings-custom-field-input"
                  />
                )}
              </Field>
              <Tooltip label="可以在接口中添加额外字段数据">
                <IconHelpCircle className="console-settings-custom-field-help" size={18} />
              </Tooltip>
              <Field<GroupSettingForm> name="custom_field1_enable" valuePropName="checked">
                {(control) => (
                  <Switch checked={Boolean(control.value)} onChange={event => control.onChange(event.currentTarget.checked)} />
                )}
              </Field>
            </Group>
            {props.customFieldRule ? <div className="field-error-text">自定义字段名称不能为空</div> : null}
          </div>

          <div className="console-settings-submit">
            <Button type="submit" loading={props.updateLoading}>
              保存设置
            </Button>
          </div>
        </div>
      </RcForm>

      {props.canDeleteGroup ? (
        <div className="group-danger-zone console-danger-zone">
          <div className="console-danger-head">
            <span className="console-danger-title">
              <IconExclamationCircle className="console-danger-icon" size={18} />
              危险操作
            </span>
            <Button variant="light" onClick={props.onToggleDanger} rightSection={props.showDangerOptions ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}>
              {props.showDangerOptions ? '收起' : '查看'}
            </Button>
          </div>
          {props.showDangerOptions ? (
            <div className="console-danger-content">
              <div className="console-danger-desc">
                分组删除后将移除分组下所有项目及接口，请谨慎操作。仅管理员可执行该操作。
              </div>
              <div className="console-danger-confirm-path">
                <Text c="dimmed">
                  请输入分组名 <Text component="span" fw={700}>{props.selectedGroupName || '-'}</Text> 以确认删除
                </Text>
                <TextInput
                  value={props.dangerConfirmName}
                  onChange={event => props.onDangerConfirmNameChange(event.currentTarget.value)}
                  placeholder={`请输入 ${props.selectedGroupName || '分组名'}`}
                  className="console-danger-confirm-input"
                />
                <Text
                  c={props.dangerConfirmName.trim() && !props.dangerConfirmMatched ? 'red' : 'dimmed'}
                  className="console-danger-confirm-hint"
                >
                  {props.dangerConfirmName.trim()
                    ? props.dangerConfirmMatched
                      ? '分组名称校验通过，可继续删除'
                      : '分组名称不匹配，暂不可删除'
                    : '输入完成后可点击删除分组'}
                </Text>
              </div>
              <Button color="red" onClick={props.onDeleteGroup} loading={props.deleteLoading} disabled={!props.dangerConfirmMatched}>
                删除分组
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </SectionCard>
  );
}
