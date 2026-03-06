import { Button, Modal, Select, Stack, Text, TextInput, Textarea } from '@mantine/core';
import RcForm, { Field } from 'rc-field-form';
import type { FormInstance } from 'rc-field-form';
import { legacyNameValidator } from '../../../utils/legacy-validation';

type AddInterfaceModalForm = {
  title: string;
  path: string;
  method: string;
  catid: number;
};

type CategoryModalForm = {
  name: string;
  desc?: string;
};

export type InterfaceCoreModalsProps = {
  confirmOpen: boolean;
  onCancelConfirm: () => void;
  onConfirmLeave: () => void;
  addInterfaceOpen: boolean;
  addInterfaceForm: FormInstance<AddInterfaceModalForm>;
  addInterfaceLoading: boolean;
  runMethods: readonly string[];
  catRows: Array<{ _id?: number; name?: string }>;
  onCancelAddInterface: () => void;
  onSubmitAddInterface: (values: AddInterfaceModalForm) => void;
  tagSettingOpen: boolean;
  tagSettingInput: string;
  tagSettingLoading: boolean;
  onTagSettingInputChange: (value: string) => void;
  onCancelTagSetting: () => void;
  onSaveTagSetting: () => void;
  bulkOpen: boolean;
  bulkValue: string;
  onBulkValueChange: (value: string) => void;
  onCancelBulk: () => void;
  onConfirmBulk: () => void;
  addCatOpen: boolean;
  addCatForm: FormInstance<CategoryModalForm>;
  addCatLoading: boolean;
  onCancelAddCat: () => void;
  onSubmitAddCat: (values: CategoryModalForm) => void;
  editCatOpen: boolean;
  editCatForm: FormInstance<CategoryModalForm>;
  editCatLoading: boolean;
  onCancelEditCat: () => void;
  onSubmitEditCat: (values: CategoryModalForm) => void;
};

function ModalActions(props: {
  cancelText?: string;
  confirmText: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex justify-end gap-3">
      <Button variant="default" onClick={props.onCancel}>
        {props.cancelText || '取消'}
      </Button>
      <Button loading={props.loading} onClick={props.onConfirm}>
        {props.confirmText}
      </Button>
    </div>
  );
}

function CategoryFormModal(props: {
  title: string;
  opened: boolean;
  form: FormInstance<CategoryModalForm>;
  loading: boolean;
  onClose: () => void;
  onSubmit: (values: CategoryModalForm) => void;
}) {
  return (
    <Modal title={props.title} opened={props.opened} onClose={props.onClose}>
      <RcForm<CategoryModalForm> form={props.form} onFinish={props.onSubmit}>
        <Stack>
          <Field<CategoryModalForm> name="name" rules={[{ required: true, message: '请输入分类名称' }]}>
            {(control, meta) => (
              <TextInput
                label="分类名称"
                value={String(control.value ?? '')}
                onChange={event => control.onChange(event.currentTarget.value)}
                error={meta.errors[0]}
              />
            )}
          </Field>
          <Field<CategoryModalForm> name="desc">
            {(control) => (
              <Textarea
                label="描述"
                minRows={3}
                value={String(control.value ?? '')}
                onChange={event => control.onChange(event.currentTarget.value)}
              />
            )}
          </Field>
          <ModalActions
            loading={props.loading}
            onCancel={props.onClose}
            onConfirm={() => props.form.submit()}
            confirmText="确认"
          />
        </Stack>
      </RcForm>
    </Modal>
  );
}

export function InterfaceCoreModals(props: InterfaceCoreModalsProps) {
  const methodOptions = props.runMethods.map(item => ({ value: item, label: item }));
  const catOptions = props.catRows.map(item => ({
    value: String(Number(item._id || 0)),
    label: String(item.name || '')
  }));

  return (
    <>
      <Modal title="你即将离开编辑页面" opened={props.confirmOpen} onClose={props.onCancelConfirm}>
        <Stack>
          <Text c="dimmed">离开页面会丢失当前编辑的内容，确定要离开吗？</Text>
          <ModalActions onCancel={props.onCancelConfirm} onConfirm={props.onConfirmLeave} confirmText="确认离开" />
        </Stack>
      </Modal>

      <Modal title="新增接口" opened={props.addInterfaceOpen} onClose={props.onCancelAddInterface}>
        <RcForm<AddInterfaceModalForm> form={props.addInterfaceForm} onFinish={props.onSubmitAddInterface}>
          <Stack>
            <Field<AddInterfaceModalForm>
              name="title"
              rules={[{ required: true, validator: legacyNameValidator('接口') }]}
            >
              {(control, meta) => (
                <TextInput
                  label="接口名称"
                  value={String(control.value ?? '')}
                  onChange={event => control.onChange(event.currentTarget.value)}
                  error={meta.errors[0]}
                />
              )}
            </Field>
            <Field<AddInterfaceModalForm> name="path" rules={[{ required: true, message: '请输入接口路径' }]}>
              {(control, meta) => (
                <TextInput
                  label="路径"
                  value={String(control.value ?? '')}
                  onChange={event => control.onChange(event.currentTarget.value)}
                  placeholder="/api/example"
                  error={meta.errors[0]}
                />
              )}
            </Field>
            <Field<AddInterfaceModalForm> name="method" rules={[{ required: true, message: '请选择 Method' }]}>
              {(control, meta) => (
                <Select
                  label="Method"
                  value={control.value ? String(control.value) : null}
                  onChange={value => control.onChange(value || undefined)}
                  data={methodOptions}
                  error={meta.errors[0]}
                />
              )}
            </Field>
            <Field<AddInterfaceModalForm> name="catid" rules={[{ required: true, message: '请选择分类' }]}>
              {(control, meta) => (
                <Select
                  label="分类"
                  value={control.value ? String(control.value) : null}
                  onChange={value => control.onChange(value ? Number(value) : undefined)}
                  data={catOptions}
                  error={meta.errors[0]}
                />
              )}
            </Field>
            <ModalActions
              loading={props.addInterfaceLoading}
              onCancel={props.onCancelAddInterface}
              onConfirm={() => props.addInterfaceForm.submit()}
              confirmText="确认"
            />
          </Stack>
        </RcForm>
      </Modal>

      <Modal title="Tag 设置" opened={props.tagSettingOpen} onClose={props.onCancelTagSetting}>
        <Stack className="legacy-interface-modal-stack">
          <Text c="dimmed">每行一个 Tag 名称，保存后会更新当前项目 Tag 列表。</Text>
          <Textarea
            minRows={8}
            value={props.tagSettingInput}
            onChange={event => props.onTagSettingInputChange(event.currentTarget.value)}
            placeholder={'example-tag\nbeta\ninternal'}
          />
          <ModalActions
            loading={props.tagSettingLoading}
            onCancel={props.onCancelTagSetting}
            onConfirm={props.onSaveTagSetting}
            confirmText="保存"
          />
        </Stack>
      </Modal>

      <Modal title="批量添加参数" opened={props.bulkOpen} onClose={props.onCancelBulk}>
        <Stack className="legacy-interface-modal-stack">
          <Text c="dimmed">每行一个 `name:example`，例如 `id:1`。</Text>
          <Textarea
            minRows={10}
            value={props.bulkValue}
            onChange={event => props.onBulkValueChange(event.currentTarget.value)}
            placeholder="name:example"
          />
          <ModalActions onCancel={props.onCancelBulk} onConfirm={props.onConfirmBulk} confirmText="导入" />
        </Stack>
      </Modal>

      <CategoryFormModal
        title="新增分类"
        opened={props.addCatOpen}
        form={props.addCatForm}
        loading={props.addCatLoading}
        onClose={props.onCancelAddCat}
        onSubmit={props.onSubmitAddCat}
      />

      <CategoryFormModal
        title="编辑分类"
        opened={props.editCatOpen}
        form={props.editCatForm}
        loading={props.editCatLoading}
        onClose={props.onCancelEditCat}
        onSubmit={props.onSubmitEditCat}
      />
    </>
  );
}
