import { Alert, Form, Input, Modal, Select, Typography } from 'antd';
import type { FormInstance } from 'antd';
const { Text } = Typography;

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
  return (
    <>
      <Modal
        title="添加分组"
        open={props.createGroupOpen}
        onCancel={props.onCancelCreateGroup}
        onOk={() => props.createGroupForm.submit()}
        confirmLoading={props.createGroupLoading}
        okText="创建"
        className="add-group-modal"
        destroyOnClose
      >
        <Form<CreateGroupForm> form={props.createGroupForm} layout="vertical" onFinish={props.onSubmitCreateGroup}>
          <Form.Item label="分组名" name="group_name" rules={[{ required: true, message: '请输入分组名称' }]}>
            <Input placeholder="请输入分组名称" />
          </Form.Item>
          <Form.Item label="简介" name="group_desc">
            <Input.TextArea rows={3} placeholder="请输入分组描述" />
          </Form.Item>
          <Form.Item label="组长（可选）" name="owner_uids">
            <Select<number>
              mode="multiple"
              placeholder="输入用户名搜索并选择"
              options={props.ownerUserOptions}
              showSearch
              filterOption={false}
              onSearch={value => props.onSearchOwnerUsers(value)}
            />
          </Form.Item>
          <Form.Item label="或直接填写 UID（逗号分隔）" name="owner_uids_text">
            <Input placeholder="例如：2,3,4" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={props.copyProjectName ? `复制项目 ${props.copyProjectName}` : '复制项目'}
        open={props.copyModalOpen}
        onCancel={props.onCancelCopyModal}
        onOk={() => props.copyForm.submit()}
        okText="确认"
        confirmLoading={props.copyModalLoading}
        destroyOnClose
      >
        <div className="legacy-console-copy-modal">
          <Alert
            message={`该操作将会复制 ${props.copyProjectName || ''} 下的所有接口集合，但不包括测试集合中的接口`}
            type="info"
          />
          <Form<CopyForm> form={props.copyForm} layout="vertical" onFinish={props.onSubmitCopy}>
            <Form.Item
              label="新项目名称"
              name="project_name"
              rules={[{ required: true, message: '请输入新项目名称' }]}
            >
              <Input placeholder="项目名称" />
            </Form.Item>
          </Form>
        </div>
      </Modal>

      <Modal
        title="添加成员"
        open={props.addMemberOpen}
        onCancel={props.onCancelAddMember}
        onOk={props.onSubmitAddMember}
        okText="添加"
        confirmLoading={props.addMemberLoading}
        destroyOnClose
      >
        <Form layout="vertical">
          <Form.Item label="按用户名搜索并选择">
            <Select<number[]>
              mode="multiple"
              value={props.memberSelectedUids}
              options={props.memberUserOptions}
              placeholder="输入用户名搜索并选择成员"
              showSearch
              filterOption={false}
              onSearch={value => props.onSearchMemberUsers(value)}
              onChange={values => props.onMemberSelectedUidsChange(Array.isArray(values) ? values : [])}
            />
          </Form.Item>
          <Form.Item label="UID 列表">
            <Input
              value={props.memberUidInput}
              onChange={event => props.onMemberUidInputChange(event.target.value)}
              placeholder="多个 UID 用逗号分隔，例如：2,3,4"
            />
            <Text type="secondary">可与上方搜索选择同时使用，系统会自动去重。</Text>
          </Form.Item>
          <Form.Item label="权限">
            <Select<GroupMemberRole>
              value={props.memberRoleInput}
              onChange={value => props.onMemberRoleInputChange(value)}
              options={[
                { value: 'owner', label: '组长' },
                { value: 'dev', label: '开发者' },
                { value: 'guest', label: '访客' }
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
