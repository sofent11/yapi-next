import type { ReactNode } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Modal,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Textarea
} from '@mantine/core';
import RcForm, { Field } from 'rc-field-form';
import type { FormInstance } from 'rc-field-form';
import { normalizeHttpMethod } from '../../../utils/http-method';
import type { AddCaseFormValues, ColFormValues, CommonSettingFormValues } from './collection-types';

const modalClassNames = {
  content: 'app-modal-content',
  header: 'app-modal-header',
  body: 'app-modal-body',
  close: 'app-modal-close',
  title: 'app-modal-title'
};

type ImportInterfaceRow = {
  key: string;
  id?: number;
  title: string;
  path?: string;
  method?: string;
  status?: string;
  isCategory: boolean;
  children?: ImportInterfaceRow[];
};

export type CollectionModalsProps = {
  colModalType: 'add' | 'edit';
  colModalOpen: boolean;
  colForm: FormInstance<ColFormValues>;
  colModalLoading: boolean;
  onCancelColModal: () => void;
  onSubmitCol: (values: ColFormValues) => void;
  importModalOpen: boolean;
  importModalLoading: boolean;
  importProjectId: number;
  currentProjectId: number;
  importProjectOptions: Array<{ label: string; value: number }>;
  selectedImportInterfaceCount: number;
  importTableRows: ImportInterfaceRow[];
  importTableLoading: boolean;
  importSelectedRowKeys: Array<string | number>;
  onImportProjectChange: (value: number) => void;
  onImportSelectedRowKeysChange: (keys: Array<string | number>) => void;
  onCancelImportModal: () => void;
  onConfirmImportInterfaces: () => void;
  methodClassName: (method?: string) => string;
  addCaseOpen: boolean;
  addCaseForm: FormInstance<AddCaseFormValues>;
  addCaseLoading: boolean;
  caseInterfaceTruncated: boolean;
  caseInterfaceOptions: Array<{ value: number; label: string; title?: string; path?: string }>;
  onCancelAddCase: () => void;
  onSubmitAddCase: (values: AddCaseFormValues) => void;
  commonSettingOpen: boolean;
  commonSettingForm: FormInstance<CommonSettingFormValues>;
  commonSettingLoading: boolean;
  onCancelCommonSetting: () => void;
  onSaveCommonSetting: () => void;
};

function ModalActions(props: { loading?: boolean; confirmText?: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="flex justify-end gap-3">
      <Button variant="default" onClick={props.onCancel}>
        取消
      </Button>
      <Button loading={props.loading} onClick={props.onConfirm}>
        {props.confirmText || '确认'}
      </Button>
    </div>
  );
}

function collectLeafKeys(row: ImportInterfaceRow): string[] {
  if (!row.children || row.children.length === 0) {
    return [String(row.key)];
  }
  return row.children.flatMap(child => collectLeafKeys(child));
}

export function CollectionModals(props: CollectionModalsProps) {
  const selectedKeySet = new Set(props.importSelectedRowKeys.map(item => String(item)));

  function toggleImportKeys(keys: string[], checked: boolean) {
    const next = new Set(props.importSelectedRowKeys.map(item => String(item)));
    for (const key of keys) {
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
    }
    props.onImportSelectedRowKeysChange(Array.from(next));
  }

  function renderImportRows(rows: ImportInterfaceRow[], depth = 0): ReactNode[] {
    return rows.flatMap(row => {
      const leafKeys = collectLeafKeys(row);
      const selectedCount = leafKeys.filter(key => selectedKeySet.has(key)).length;
      const checked = selectedCount > 0 && selectedCount === leafKeys.length;
      const indeterminate = selectedCount > 0 && selectedCount < leafKeys.length;
      const current = (
        <Table.Tr key={row.key} className={row.isCategory ? 'collection-import-category-row' : undefined}>
          <Table.Td>
            <div className="flex items-center gap-2" style={{ paddingLeft: `${depth * 20}px` }}>
              <Checkbox
                checked={checked}
                indeterminate={indeterminate}
                onChange={event => toggleImportKeys(leafKeys, event.currentTarget.checked)}
              />
              <span>{row.isCategory ? <Text fw={600}>{row.title}</Text> : row.title}</span>
            </div>
          </Table.Td>
          <Table.Td>{row.path || '-'}</Table.Td>
          <Table.Td>
            {row.isCategory ? (
              '-'
            ) : (
              <span className={props.methodClassName(normalizeHttpMethod(row.method || 'GET'))}>
                {normalizeHttpMethod(row.method || 'GET')}
              </span>
            )}
          </Table.Td>
          <Table.Td>
            {row.isCategory ? (
              '-'
            ) : row.status === 'done' ? (
              <span className="status-chip done">已完成</span>
            ) : (
              <span className="status-chip undone">未完成</span>
            )}
          </Table.Td>
        </Table.Tr>
      );
      return row.children?.length ? [current, ...renderImportRows(row.children, depth + 1)] : [current];
    });
  }

  return (
    <>
      <Modal
        title={props.colModalType === 'add' ? '添加测试集合' : '编辑测试集合'}
        opened={props.colModalOpen}
        onClose={props.onCancelColModal}
        classNames={modalClassNames}
      >
        <RcForm<ColFormValues> form={props.colForm} onFinish={values => void props.onSubmitCol(values)}>
          <Stack>
            <Field<ColFormValues> name="name" rules={[{ required: true, message: '请输入集合命名！' }]}>
              {(control, meta) => (
                <TextInput
                  label="集合名"
                  value={String(control.value ?? '')}
                  onChange={event => control.onChange(event.currentTarget.value)}
                  error={meta.errors[0]}
                />
              )}
            </Field>
            <Field<ColFormValues> name="desc">
              {(control) => (
                <Textarea
                  label="简介"
                  minRows={3}
                  value={String(control.value ?? '')}
                  onChange={event => control.onChange(event.currentTarget.value)}
                />
              )}
            </Field>
            <ModalActions
              loading={props.colModalLoading}
              onCancel={props.onCancelColModal}
              onConfirm={() => props.colForm.submit()}
            />
          </Stack>
        </RcForm>
      </Modal>

      <Modal
        title="导入接口到集合"
        opened={props.importModalOpen}
        onClose={props.onCancelImportModal}
        size="72rem"
        classNames={modalClassNames}
      >
        <Stack className="workspace-form-modal-stack">
          <div className="flex flex-wrap items-center gap-3">
            <Text>选择要导入的项目：</Text>
            <Select
              value={String(props.importProjectId > 0 ? props.importProjectId : props.currentProjectId)}
              className="collection-import-project-select"
              data={props.importProjectOptions.map(item => ({
                label: item.label,
                value: String(item.value)
              }))}
              onChange={value => {
                if (value) {
                  props.onImportProjectChange(Number(value));
                }
              }}
            />
          </div>
          <div className="collection-import-summary flex flex-wrap items-center gap-3">
            <Alert
              color="blue"
              className="collection-import-summary-alert flex-1"
              title={`已选择 ${props.selectedImportInterfaceCount} 个接口`}
            />
            <Button
              size="xs"
              variant="default"
              onClick={() => props.onImportSelectedRowKeysChange([])}
              disabled={props.importSelectedRowKeys.length === 0}
            >
              清空选择
            </Button>
          </div>
          <div className="overflow-x-auto">
            <Table withTableBorder striped highlightOnHover className="collection-import-table">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>接口名称</Table.Th>
                  <Table.Th>接口路径</Table.Th>
                  <Table.Th>请求方法</Table.Th>
                  <Table.Th>状态</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {props.importTableLoading ? (
                  <Table.Tr>
                    <Table.Td colSpan={4}>
                      <Text c="dimmed" ta="center" py="md">加载中...</Text>
                    </Table.Td>
                  </Table.Tr>
                ) : props.importTableRows.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={4}>
                      <Text c="dimmed" ta="center" py="md">当前项目暂无可导入接口</Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  renderImportRows(props.importTableRows)
                )}
              </Table.Tbody>
            </Table>
          </div>
          <ModalActions
            loading={props.importModalLoading}
            onCancel={props.onCancelImportModal}
            onConfirm={props.onConfirmImportInterfaces}
          />
        </Stack>
      </Modal>

      <Modal title="添加测试用例" opened={props.addCaseOpen} onClose={props.onCancelAddCase} classNames={modalClassNames}>
        <RcForm<AddCaseFormValues> form={props.addCaseForm} onFinish={values => void props.onSubmitAddCase(values)}>
          <Stack>
            {props.caseInterfaceTruncated ? (
              <Alert
                color="yellow"
                className="collection-case-truncated-alert"
                title={`接口选项仅展示前 ${props.caseInterfaceOptions.length} 条，请通过左侧筛选或搜索后再添加。`}
              />
            ) : null}
            <Field<AddCaseFormValues> name="interface_id" rules={[{ required: true, message: '请选择接口' }]}>
              {(control, meta) => (
                <Select
                  label="接口"
                  searchable
                  placeholder="搜索接口名称或路径"
                  value={control.value ? String(control.value) : null}
                  onChange={value => control.onChange(value ? Number(value) : undefined)}
                  data={props.caseInterfaceOptions.map(item => ({
                    value: String(item.value),
                    label: [item.label, item.path].filter(Boolean).join(' | ')
                  }))}
                  error={meta.errors[0]}
                />
              )}
            </Field>
            <Field<AddCaseFormValues> name="casename" rules={[{ required: true, message: '请输入用例名称' }]}>
              {(control, meta) => (
                <TextInput
                  label="用例名称"
                  placeholder="例如：登录成功用例"
                  value={String(control.value ?? '')}
                  onChange={event => control.onChange(event.currentTarget.value)}
                  error={meta.errors[0]}
                />
              )}
            </Field>
            <Field<AddCaseFormValues> name="case_env">
              {(control) => (
                <TextInput
                  label="测试环境"
                  placeholder="例如：dev"
                  value={String(control.value ?? '')}
                  onChange={event => control.onChange(event.currentTarget.value)}
                />
              )}
            </Field>
            <ModalActions
              loading={props.addCaseLoading}
              onCancel={props.onCancelAddCase}
              onConfirm={() => props.addCaseForm.submit()}
            />
          </Stack>
        </RcForm>
      </Modal>

      <Modal
        title="通用规则配置"
        opened={props.commonSettingOpen}
        onClose={props.onCancelCommonSetting}
        size="72rem"
        classNames={modalClassNames}
      >
        <RcForm<CommonSettingFormValues> form={props.commonSettingForm}>
          <Stack>
            <Alert
              color="blue"
              className="collection-common-setting-alert"
              title="执行顺序：先通用规则，再用例脚本。建议先配置字段校验，再补充脚本断言。"
            />
            <Field<CommonSettingFormValues> name="checkHttpCodeIs200" valuePropName="checked">
              {(control) => (
                <Switch
                  label="检查 Http Code = 200"
                  checked={Boolean(control.value)}
                  onChange={event => control.onChange(event.currentTarget.checked)}
                  description="启用后，非 200 状态码将直接判定失败"
                />
              )}
            </Field>
            <div className="collection-inline-setting-row">
              <Text fw={500}>检查返回 JSON 字段</Text>
              <Text c="dimmed" size="sm" mb="xs">例如检查 code 是否等于 0</Text>
              <div className="collection-inline-setting-fields flex flex-wrap items-end gap-3">
                <Field<CommonSettingFormValues> name="checkResponseFieldEnable" valuePropName="checked">
                  {(control) => (
                    <Switch
                      checked={Boolean(control.value)}
                      onChange={event => control.onChange(event.currentTarget.checked)}
                    />
                  )}
                </Field>
                <Field<CommonSettingFormValues> name="checkResponseFieldName">
                  {(control) => (
                    <TextInput
                      className="collection-inline-input"
                      placeholder="字段名，如 code"
                      value={String(control.value ?? '')}
                      onChange={event => control.onChange(event.currentTarget.value)}
                    />
                  )}
                </Field>
                <Field<CommonSettingFormValues> name="checkResponseFieldValue">
                  {(control) => (
                    <TextInput
                      className="collection-inline-input"
                      placeholder="期望值，如 0"
                      value={String(control.value ?? '')}
                      onChange={event => control.onChange(event.currentTarget.value)}
                    />
                  )}
                </Field>
              </div>
            </div>
            <Field<CommonSettingFormValues> name="checkResponseSchema" valuePropName="checked">
              {(control) => (
                <Switch
                  label="检查返回数据结构(response schema)"
                  checked={Boolean(control.value)}
                  onChange={event => control.onChange(event.currentTarget.checked)}
                  description="仅在接口 response 定义为 JSON Schema 时生效"
                />
              )}
            </Field>
            <div className="collection-inline-setting-row">
              <Text fw={500}>全局测试脚本</Text>
              <Text c="dimmed" size="sm" mb="xs">启用后每个 case 会先执行全局脚本，再执行 case 脚本</Text>
              <div className="collection-script-switch-row flex flex-wrap items-center gap-3">
                <Field<CommonSettingFormValues> name="checkScriptEnable" valuePropName="checked">
                  {(control) => (
                    <Switch
                      checked={Boolean(control.value)}
                      onChange={event => control.onChange(event.currentTarget.checked)}
                    />
                  )}
                </Field>
                <span>启用脚本</span>
              </div>
              <Field<CommonSettingFormValues> name="checkScriptContent">
                {(control) => (
                  <Textarea
                    mt="sm"
                    minRows={10}
                    placeholder="输入全局测试脚本"
                    value={String(control.value ?? '')}
                    onChange={event => control.onChange(event.currentTarget.value)}
                  />
                )}
              </Field>
            </div>
            <ModalActions
              loading={props.commonSettingLoading}
              confirmText="保存"
              onCancel={props.onCancelCommonSetting}
              onConfirm={props.onSaveCommonSetting}
            />
          </Stack>
        </RcForm>
      </Modal>
    </>
  );
}
