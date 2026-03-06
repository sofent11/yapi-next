import { Alert, Button, Modal, MultiSelect, Select, Stack, Text, TextInput, Textarea } from '@mantine/core';
import RcForm, { Field } from 'rc-field-form';
import type { FormInstance } from 'rc-field-form';

type GroupMemberRole = 'owner' | 'dev' | 'guest';

type CreateGroupForm = {
  group_name: string;
  group_desc?: string;
  owner_uids?: number[];
  owner_uids_text?: string;
};

type CopyForm = {
  project_name: string;
};

type ProjectConsoleModalsProps = {
  createGroupOpen: boolean;
  createGroupLoading: boolean;
  createGroupForm: FormInstance<CreateGroupForm>;
  ownerUserOptions: Array<{ label: string; value: number }>;
  onSearchOwnerUsers: (keyword: string) => void;
  onCancelCreateGroup: () => void;
  onSubmitCreateGroup: (values: CreateGroupForm) => void;
  copyModalOpen: boolean;
  copyModalLoading: boolean;
  copyProjectName?: string;
  copyForm: FormInstance<CopyForm>;
  onCancelCopyModal: () => void;
  onSubmitCopy: (values: CopyForm) => void;
  addMemberOpen: boolean;
  addMemberLoading: boolean;
  memberSelectedUids: number[];
  memberUserOptions: Array<{ label: string; value: number }>;
  memberUidInput: string;
  memberRoleInput: GroupMemberRole;
  onSearchMemberUsers: (keyword: string) => void;
  onMemberSelectedUidsChange: (uids: number[]) => void;
  onMemberUidInputChange: (value: string) => void;
  onMemberRoleInputChange: (role: GroupMemberRole) => void;
  onCancelAddMember: () => void;
  onSubmitAddMember: () => void;
};

export function ProjectConsoleModals(props: ProjectConsoleModalsProps) {
  const ownerOptions = props.ownerUserOptions.map(item => ({
    value: String(item.value),
    label: item.label
  }));

  const memberOptions = props.memberUserOptions.map(item => ({
    value: String(item.value),
    label: item.label
  }));

  return (
    <>
      <Modal
        title="添加分组"
        opened={props.createGroupOpen}
        onClose={props.onCancelCreateGroup}
        className="add-group-modal"
      >
        <RcForm<CreateGroupForm> form={props.createGroupForm} onFinish={props.onSubmitCreateGroup}>
          <Stack>
            <Field<CreateGroupForm> name="group_name" rules={[{ required: true, message: '请输入分组名称' }]}>
              {(control, meta) => (
                <TextInput
                  label="分组名"
                  value={control.value}
                  onChange={event => control.onChange(event.currentTarget.value)}
                  placeholder="请输入分组名称"
                  error={meta.errors[0]}
                />
              )}
            </Field>
            <Field<CreateGroupForm> name="group_desc">
              {(control) => (
                <Textarea
                  label="简介"
                  rows={3}
                  value={control.value}
                  onChange={event => control.onChange(event.currentTarget.value)}
                  placeholder="请输入分组描述"
                />
              )}
            </Field>
            <Field<CreateGroupForm> name="owner_uids">
              {(control) => (
                <MultiSelect
                  label="组长（可选）"
                  value={Array.isArray(control.value) ? control.value.map((item: number) => String(item)) : []}
                  onChange={values => control.onChange(values.map(item => Number(item)))}
                  data={ownerOptions}
                  placeholder="输入用户名搜索并选择"
                  searchable
                  onSearchChange={props.onSearchOwnerUsers}
                />
              )}
            </Field>
            <Field<CreateGroupForm> name="owner_uids_text">
              {(control) => (
                <TextInput
                  label="或直接填写 UID（逗号分隔）"
                  value={control.value}
                  onChange={event => control.onChange(event.currentTarget.value)}
                  placeholder="例如：2,3,4"
                />
              )}
            </Field>
            <div className="flex justify-end gap-3">
              <Button variant="default" onClick={props.onCancelCreateGroup}>
                取消
              </Button>
              <Button loading={props.createGroupLoading} onClick={() => props.createGroupForm.submit()}>
                创建
              </Button>
            </div>
          </Stack>
        </RcForm>
      </Modal>

      <Modal
        title={props.copyProjectName ? `复制项目 ${props.copyProjectName}` : '复制项目'}
        opened={props.copyModalOpen}
        onClose={props.onCancelCopyModal}
      >
        <div className="console-copy-modal">
          <Alert color="blue" title={`该操作将会复制 ${props.copyProjectName || ''} 下的所有接口集合，但不包括测试集合中的接口`} />
          <RcForm<CopyForm> form={props.copyForm} onFinish={props.onSubmitCopy}>
            <Stack mt="md">
              <Field<CopyForm> name="project_name" rules={[{ required: true, message: '请输入新项目名称' }]}>
                {(control, meta) => (
                  <TextInput
                    label="新项目名称"
                    value={control.value}
                    onChange={event => control.onChange(event.currentTarget.value)}
                    placeholder="项目名称"
                    error={meta.errors[0]}
                  />
                )}
              </Field>
              <div className="flex justify-end gap-3">
                <Button variant="default" onClick={props.onCancelCopyModal}>
                  取消
                </Button>
                <Button loading={props.copyModalLoading} onClick={() => props.copyForm.submit()}>
                  确认
                </Button>
              </div>
            </Stack>
          </RcForm>
        </div>
      </Modal>

      <Modal title="添加成员" opened={props.addMemberOpen} onClose={props.onCancelAddMember}>
        <Stack>
          <MultiSelect
            label="按用户名搜索并选择"
            value={props.memberSelectedUids.map(item => String(item))}
            data={memberOptions}
            placeholder="输入用户名搜索并选择成员"
            searchable
            onSearchChange={props.onSearchMemberUsers}
            onChange={values => props.onMemberSelectedUidsChange(values.map(item => Number(item)))}
          />
          <div>
            <TextInput
              label="UID 列表"
              value={props.memberUidInput}
              onChange={event => props.onMemberUidInputChange(event.currentTarget.value)}
              placeholder="多个 UID 用逗号分隔，例如：2,3,4"
            />
            <Text c="dimmed" size="sm" mt={6}>
              可与上方搜索选择同时使用，系统会自动去重。
            </Text>
          </div>
          <Select
            label="权限"
            value={props.memberRoleInput}
            onChange={value => {
              if (value) {
                props.onMemberRoleInputChange(value as GroupMemberRole);
              }
            }}
            data={[
              { value: 'owner', label: '组长' },
              { value: 'dev', label: '开发者' },
              { value: 'guest', label: '访客' }
            ]}
          />
          <div className="flex justify-end gap-3">
            <Button variant="default" onClick={props.onCancelAddMember}>
              取消
            </Button>
            <Button loading={props.addMemberLoading} onClick={props.onSubmitAddMember}>
              添加
            </Button>
          </div>
        </Stack>
      </Modal>
    </>
  );
}
