import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FollowItem, GroupListItem, LegacyInterfaceDTO, ProjectListItem } from '@yapi-next/shared-types';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Form,
  Input,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message
} from 'antd';
import {
  useAddProjectMutation,
  useAddProjectMemberMutation,
  useAddFollowMutation,
  useAddInterfaceCatMutation,
  useAddInterfaceMutation,
  useChangeProjectMemberEmailNoticeMutation,
  useChangeProjectMemberRoleMutation,
  useCopyProjectMutation,
  useDelProjectMutation,
  useDelFollowMutation,
  useDelInterfaceCatMutation,
  useDelInterfaceMutation,
  useDelProjectMemberMutation,
  useLazyFetchSwaggerByUrlQuery,
  useGetCatMenuQuery,
  useLazyCheckProjectNameQuery,
  useGetGroupListQuery,
  useGetFollowListQuery,
  useGetInterfaceListQuery,
  useGetProjectMemberListQuery,
  useGetProjectEnvQuery,
  useGetProjectListQuery,
  useGetProjectQuery,
  useGetProjectTokenQuery,
  useLazySearchProjectQuery,
  useGetUserStatusQuery,
  useLoginMutation,
  useLogoutMutation,
  useUpsetProjectMutation,
  useUpdateProjectEnvMutation,
  useUpdateProjectMutation,
  useUpdateProjectTagMutation,
  useUpdateProjectTokenMutation,
  useUpdateInterfaceCatMutation,
  useUpdateInterfaceMutation
} from '../services/yapi-api';
import { safeApiRequest } from '../utils/safe-request';

const { Paragraph } = Typography;

function toJsonText(input: unknown): string {
  try {
    return JSON.stringify(input, null, 2);
  } catch (_err) {
    return '[]';
  }
}

export function ProjectWorkbenchPage() {
  const [email, setEmail] = useState<string>('admin@example.com');
  const [password, setPassword] = useState<string>('admin123');
  const [groupId, setGroupId] = useState<number>(0);
  const [selectedProjectId, setSelectedProjectId] = useState<number>(0);
  const [accessToken, setAccessToken] = useState<string>('');
  const [projectName, setProjectName] = useState<string>('');
  const [projectBasepath, setProjectBasepath] = useState<string>('');
  const [projectDesc, setProjectDesc] = useState<string>('');
  const [projectIcon, setProjectIcon] = useState<string>('project');
  const [projectColor, setProjectColor] = useState<string>('#1890ff');
  const [newProjectName, setNewProjectName] = useState<string>('新项目');
  const [newProjectBasepath, setNewProjectBasepath] = useState<string>('/api/new');
  const [newProjectType, setNewProjectType] = useState<'public' | 'private'>('private');
  const [copyProjectName, setCopyProjectName] = useState<string>('复制项目');
  const [copyProjectBasepath, setCopyProjectBasepath] = useState<string>('/api/copy');
  const [copyProjectType, setCopyProjectType] = useState<'public' | 'private'>('private');
  const [envText, setEnvText] = useState<string>('[]');
  const [tagText, setTagText] = useState<string>('[]');
  const [memberUidsText, setMemberUidsText] = useState<string>('2,3');
  const [memberUidAction, setMemberUidAction] = useState<string>('2');
  const [memberRole, setMemberRole] = useState<'owner' | 'dev' | 'guest'>('dev');
  const [memberNotice, setMemberNotice] = useState<boolean>(true);
  const [searchKeyword, setSearchKeyword] = useState<string>('订单');
  const [swaggerUrl, setSwaggerUrl] = useState<string>('https://petstore3.swagger.io/api/v3/openapi.json');
  const [searchResultText, setSearchResultText] = useState<string>('');
  const [swaggerPreviewText, setSwaggerPreviewText] = useState<string>('');
  const [catIdAction, setCatIdAction] = useState<string>('');
  const [catName, setCatName] = useState<string>('默认分类');
  const [catDesc, setCatDesc] = useState<string>('');
  const [interfaceIdAction, setInterfaceIdAction] = useState<string>('');
  const [interfaceTitle, setInterfaceTitle] = useState<string>('示例接口');
  const [interfacePath, setInterfacePath] = useState<string>('/demo/path');
  const [interfaceMethod, setInterfaceMethod] = useState<'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'>(
    'GET'
  );

  const [login, loginState] = useLoginMutation();
  const [logout, logoutState] = useLogoutMutation();
  const [updateToken, updateTokenState] = useUpdateProjectTokenMutation();
  const [addProject, addProjectState] = useAddProjectMutation();
  const [copyProject, copyProjectState] = useCopyProjectMutation();
  const [addFollow, addFollowState] = useAddFollowMutation();
  const [delFollow, delFollowState] = useDelFollowMutation();
  const [delProject, delProjectState] = useDelProjectMutation();
  const [updateProject, updateProjectState] = useUpdateProjectMutation();
  const [upsetProject, upsetProjectState] = useUpsetProjectMutation();
  const [updateProjectEnv, updateProjectEnvState] = useUpdateProjectEnvMutation();
  const [updateProjectTag, updateProjectTagState] = useUpdateProjectTagMutation();
  const [addProjectMember, addProjectMemberState] = useAddProjectMemberMutation();
  const [delProjectMember, delProjectMemberState] = useDelProjectMemberMutation();
  const [changeProjectMemberRole, changeProjectMemberRoleState] = useChangeProjectMemberRoleMutation();
  const [changeProjectMemberEmailNotice, changeProjectMemberEmailNoticeState] =
    useChangeProjectMemberEmailNoticeMutation();
  const [addInterfaceCat, addInterfaceCatState] = useAddInterfaceCatMutation();
  const [updateInterfaceCat, updateInterfaceCatState] = useUpdateInterfaceCatMutation();
  const [delInterfaceCat, delInterfaceCatState] = useDelInterfaceCatMutation();
  const [addInterface, addInterfaceState] = useAddInterfaceMutation();
  const [updateInterface, updateInterfaceState] = useUpdateInterfaceMutation();
  const [delInterface, delInterfaceState] = useDelInterfaceMutation();
  const [triggerCheckProjectName, checkProjectNameState] = useLazyCheckProjectNameQuery();
  const [triggerSearchProject, searchProjectState] = useLazySearchProjectQuery();
  const [triggerFetchSwagger, fetchSwaggerState] = useLazyFetchSwaggerByUrlQuery();
  const callApi = useCallback(
    <T extends { errcode?: number; errmsg?: string }>(request: Promise<T>, fallback: string) =>
      safeApiRequest(request, { fallback, onError: msg => message.error(msg) }),
    []
  );

  const statusQuery = useGetUserStatusQuery();
  const isLoggedIn = statusQuery.data?.errcode === 0 && !!statusQuery.data?.data;

  const groupListQuery = useGetGroupListQuery(undefined, { skip: !isLoggedIn });
  const followListQuery = useGetFollowListQuery(undefined, { skip: !isLoggedIn });
  const projectListQuery = useGetProjectListQuery(
    { groupId },
    { skip: !isLoggedIn || groupId <= 0 }
  );
  const projectDetailQuery = useGetProjectQuery(
    { projectId: selectedProjectId, token: accessToken || undefined },
    { skip: selectedProjectId <= 0 }
  );
  const projectTokenQuery = useGetProjectTokenQuery(
    { projectId: selectedProjectId },
    { skip: !isLoggedIn || selectedProjectId <= 0 }
  );
  const projectEnvQuery = useGetProjectEnvQuery(
    { projectId: selectedProjectId },
    { skip: selectedProjectId <= 0 }
  );
  const projectMemberListQuery = useGetProjectMemberListQuery(
    { id: selectedProjectId },
    { skip: selectedProjectId <= 0 || !isLoggedIn }
  );
  const catMenuQuery = useGetCatMenuQuery(
    { projectId: selectedProjectId, token: accessToken || undefined },
    { skip: selectedProjectId <= 0 }
  );
  const interfaceListQuery = useGetInterfaceListQuery(
    {
      projectId: selectedProjectId,
      token: accessToken || undefined,
      page: 1,
      limit: 200
    },
    { skip: selectedProjectId <= 0 }
  );

  useEffect(() => {
    const groups = groupListQuery.data?.data || [];
    if (groupId > 0 || groups.length === 0) return;
    const firstPublic = groups.find(group => group.type !== 'private');
    if (firstPublic?._id) {
      setGroupId(firstPublic._id);
      return;
    }
    setGroupId(groups[0]._id);
  }, [groupListQuery.data, groupId]);

  useEffect(() => {
    const project = projectDetailQuery.data?.data;
    if (!project) return;
    setProjectName(project.name || '');
    setProjectBasepath(project.basepath || '');
    setProjectDesc(project.desc || '');
    setProjectIcon((project as any).icon || 'project');
    setProjectColor((project as any).color || '#1890ff');
    if (Array.isArray(project.tag)) {
      setTagText(toJsonText(project.tag));
    }
  }, [projectDetailQuery.data]);

  useEffect(() => {
    const env = projectEnvQuery.data?.data?.env;
    if (Array.isArray(env)) {
      setEnvText(toJsonText(env));
    }
  }, [projectEnvQuery.data]);

  useEffect(() => {
    const cats = catMenuQuery.data?.data || [];
    if (cats.length === 0) {
      setCatIdAction('');
      return;
    }
    if (catIdAction && cats.some(item => `${item._id}` === catIdAction)) {
      return;
    }
    setCatIdAction(String(cats[0]._id));
  }, [catMenuQuery.data, catIdAction]);

  const groups = (groupListQuery.data?.data || []) as GroupListItem[];
  const projectRows = useMemo(() => {
    const list = projectListQuery.data?.data?.list || [];
    return list.map(item => ({ ...item, key: item._id })) as Array<ProjectListItem & { key: number }>;
  }, [projectListQuery.data]);
  const followRows = useMemo(() => {
    const list = followListQuery.data?.data?.list || [];
    return list.map(item => ({ ...item, key: `${item.projectid}` })) as Array<FollowItem & { key: string }>;
  }, [followListQuery.data]);
  const catRows = useMemo(() => {
    const list = catMenuQuery.data?.data || [];
    return list.map(item => ({ ...item, key: item._id }));
  }, [catMenuQuery.data]);
  const interfaceRows = useMemo(() => {
    const list = interfaceListQuery.data?.data?.list || [];
    return list.map(item => ({ ...item, key: item._id })) as Array<LegacyInterfaceDTO & { key?: number }>;
  }, [interfaceListQuery.data]);

  async function handleLogin() {
    const response = await callApi(login({ email, password }).unwrap(), '登录失败');
    if (!response) return;
    message.success('登录成功');
    statusQuery.refetch();
  }

  async function handleLogout() {
    const response = await callApi(logout().unwrap(), '退出失败');
    if (!response) return;
    setSelectedProjectId(0);
    setAccessToken('');
    message.success('已退出');
    statusQuery.refetch();
  }

  async function handleUpdateToken() {
    if (selectedProjectId <= 0) return;
    const response = await callApi(updateToken({ projectId: selectedProjectId }).unwrap(), '更新 token 失败');
    if (!response) return;
    if (response.data?.token) {
      setAccessToken(response.data.token);
    }
    projectTokenQuery.refetch();
    message.success('token 已更新');
  }

  async function handleUpdateProject() {
    if (selectedProjectId <= 0) return;
    const response = await callApi(
      updateProject({
        id: selectedProjectId,
        name: projectName,
        basepath: projectBasepath,
        desc: projectDesc
      }).unwrap(),
      '更新项目失败'
    );
    if (!response) return;
    await projectDetailQuery.refetch();
    message.success('项目信息已更新');
  }

  async function handleAddProject() {
    if (groupId <= 0) {
      message.error('请先选择分组');
      return;
    }
    if (!newProjectName.trim()) {
      message.error('项目名称不能为空');
      return;
    }
    const response = await callApi(
      addProject({
        name: newProjectName.trim(),
        group_id: groupId,
        basepath: newProjectBasepath.trim(),
        project_type: newProjectType
      }).unwrap(),
      '创建项目失败'
    );
    if (!response) return;
    await projectListQuery.refetch();
    if (response.data?._id) {
      setSelectedProjectId(response.data._id);
    }
    message.success('项目已创建');
  }

  async function handleDelProject() {
    if (selectedProjectId <= 0) return;
    const response = await callApi(delProject({ id: selectedProjectId }).unwrap(), '删除项目失败');
    if (!response) return;
    setSelectedProjectId(0);
    await projectListQuery.refetch();
    message.success('项目已删除');
  }

  async function handleCopyProject() {
    if (selectedProjectId <= 0) {
      message.error('请先选择源项目');
      return;
    }
    if (groupId <= 0) {
      message.error('请先选择分组');
      return;
    }
    if (!copyProjectName.trim()) {
      message.error('复制后的项目名称不能为空');
      return;
    }
    const response = await callApi(
      copyProject({
        _id: selectedProjectId,
        name: copyProjectName.trim(),
        group_id: groupId,
        basepath: copyProjectBasepath.trim(),
        project_type: copyProjectType
      }).unwrap(),
      '复制项目失败'
    );
    if (!response) return;
    await projectListQuery.refetch();
    if (response.data?._id) {
      setSelectedProjectId(response.data._id);
    }
    message.success('项目已复制');
  }

  async function handleAddFollow(projectId: number) {
    const response = await callApi(addFollow({ projectid: projectId }).unwrap(), '关注项目失败');
    if (!response) return;
    await Promise.all([followListQuery.refetch(), projectListQuery.refetch()]);
    message.success('已关注项目');
  }

  async function handleDelFollow(projectId: number) {
    const response = await callApi(delFollow({ projectid: projectId }).unwrap(), '取消关注失败');
    if (!response) return;
    await Promise.all([followListQuery.refetch(), projectListQuery.refetch()]);
    message.success('已取消关注');
  }

  async function handleUpsetProject() {
    if (selectedProjectId <= 0) return;
    const response = await callApi(
      upsetProject({
        id: selectedProjectId,
        icon: projectIcon,
        color: projectColor
      }).unwrap(),
      '项目图标/颜色更新失败'
    );
    if (!response) return;
    await projectDetailQuery.refetch();
    message.success('项目图标/颜色已更新');
  }

  async function handleCheckProjectName() {
    if (groupId <= 0) {
      message.error('请先选择分组');
      return;
    }
    const response = await callApi(
      triggerCheckProjectName({
        name: newProjectName.trim(),
        groupId
      }).unwrap(),
      '项目名校验失败'
    );
    if (!response) return;
    message.success('项目名可用');
  }

  async function handleSearchProject() {
    const response = await callApi(triggerSearchProject({ q: searchKeyword.trim() }).unwrap(), '搜索失败');
    if (!response) return;
    setSearchResultText(toJsonText(response.data || {}));
    message.success('搜索完成');
  }

  async function handleFetchSwagger() {
    const response = await callApi(triggerFetchSwagger({ url: swaggerUrl.trim() }).unwrap(), '获取 Swagger 失败');
    if (!response) return;
    setSwaggerPreviewText(toJsonText(response.data || {}));
    message.success('Swagger 数据已拉取');
  }

  async function handleUpdateEnv() {
    if (selectedProjectId <= 0) return;
    let env: Array<Record<string, unknown>>;
    try {
      const parsed = JSON.parse(envText);
      if (!Array.isArray(parsed)) throw new Error('env 必须是数组');
      env = parsed;
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'env JSON 格式错误');
      return;
    }
    const response = await callApi(
      updateProjectEnv({ id: selectedProjectId, env: env as any }).unwrap(),
      '更新环境失败'
    );
    if (!response) return;
    await projectEnvQuery.refetch();
    message.success('项目环境已更新');
  }

  async function handleUpdateTag() {
    if (selectedProjectId <= 0) return;
    let tag: Array<Record<string, unknown>>;
    try {
      const parsed = JSON.parse(tagText);
      if (!Array.isArray(parsed)) throw new Error('tag 必须是数组');
      tag = parsed;
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'tag JSON 格式错误');
      return;
    }
    const response = await callApi(
      updateProjectTag({ id: selectedProjectId, tag: tag as any }).unwrap(),
      '更新标签失败'
    );
    if (!response) return;
    await projectDetailQuery.refetch();
    message.success('项目标签已更新');
  }

  async function handleAddProjectMembers() {
    if (selectedProjectId <= 0) return;
    const memberUids = memberUidsText
      .split(',')
      .map(item => Number(item.trim()))
      .filter(item => Number.isFinite(item) && item > 0);
    if (memberUids.length === 0) {
      message.error('请输入有效的 member_uids（逗号分隔）');
      return;
    }
    const response = await callApi(
      addProjectMember({
        id: selectedProjectId,
        member_uids: memberUids,
        role: memberRole
      }).unwrap(),
      '添加成员失败'
    );
    if (!response) return;
    await projectMemberListQuery.refetch();
    message.success('项目成员已更新');
  }

  async function handleChangeProjectMemberRole() {
    if (selectedProjectId <= 0) return;
    const memberUid = Number(memberUidAction);
    if (!Number.isFinite(memberUid) || memberUid <= 0) {
      message.error('member_uid 无效');
      return;
    }
    const response = await callApi(
      changeProjectMemberRole({
        id: selectedProjectId,
        member_uid: memberUid,
        role: memberRole
      }).unwrap(),
      '修改角色失败'
    );
    if (!response) return;
    await projectMemberListQuery.refetch();
    message.success('成员角色已更新');
  }

  async function handleChangeProjectMemberEmailNotice() {
    if (selectedProjectId <= 0) return;
    const memberUid = Number(memberUidAction);
    if (!Number.isFinite(memberUid) || memberUid <= 0) {
      message.error('member_uid 无效');
      return;
    }
    const response = await callApi(
      changeProjectMemberEmailNotice({
        id: selectedProjectId,
        member_uid: memberUid,
        notice: memberNotice
      }).unwrap(),
      '修改邮件通知失败'
    );
    if (!response) return;
    await projectMemberListQuery.refetch();
    message.success('成员邮件通知已更新');
  }

  async function handleDelProjectMember() {
    if (selectedProjectId <= 0) return;
    const memberUid = Number(memberUidAction);
    if (!Number.isFinite(memberUid) || memberUid <= 0) {
      message.error('member_uid 无效');
      return;
    }
    const response = await callApi(
      delProjectMember({
        id: selectedProjectId,
        member_uid: memberUid
      }).unwrap(),
      '删除成员失败'
    );
    if (!response) return;
    await projectMemberListQuery.refetch();
    message.success('项目成员已删除');
  }

  async function handleAddCat() {
    if (selectedProjectId <= 0) return;
    if (!catName.trim()) {
      message.error('分类名称不能为空');
      return;
    }
    const response = await callApi(
      addInterfaceCat({
        project_id: selectedProjectId,
        name: catName.trim(),
        desc: catDesc.trim() || undefined,
        token: accessToken || undefined
      }).unwrap(),
      '新增分类失败'
    );
    if (!response) return;
    await catMenuQuery.refetch();
    await interfaceListQuery.refetch();
    message.success('分类已新增');
  }

  async function handleUpdateCat() {
    if (selectedProjectId <= 0) return;
    const catid = Number(catIdAction);
    if (!Number.isFinite(catid) || catid <= 0) {
      message.error('请选择分类');
      return;
    }
    const response = await callApi(
      updateInterfaceCat({
        catid,
        project_id: selectedProjectId,
        name: catName.trim() || undefined,
        desc: catDesc.trim() || undefined,
        token: accessToken || undefined
      }).unwrap(),
      '更新分类失败'
    );
    if (!response) return;
    await catMenuQuery.refetch();
    message.success('分类已更新');
  }

  async function handleDelCat() {
    if (selectedProjectId <= 0) return;
    const catid = Number(catIdAction);
    if (!Number.isFinite(catid) || catid <= 0) {
      message.error('请选择分类');
      return;
    }
    const response = await callApi(
      delInterfaceCat({
        catid,
        project_id: selectedProjectId,
        token: accessToken || undefined
      }).unwrap(),
      '删除分类失败'
    );
    if (!response) return;
    await catMenuQuery.refetch();
    await interfaceListQuery.refetch();
    message.success('分类已删除');
  }

  async function handleAddInterface() {
    if (selectedProjectId <= 0) return;
    const catid = Number(catIdAction);
    if (!Number.isFinite(catid) || catid <= 0) {
      message.error('请先选择分类');
      return;
    }
    if (!interfaceTitle.trim() || !interfacePath.trim()) {
      message.error('接口标题和路径不能为空');
      return;
    }
    const response = await callApi(
      addInterface({
        project_id: selectedProjectId,
        catid,
        title: interfaceTitle.trim(),
        path: interfacePath.trim(),
        method: interfaceMethod,
        token: accessToken || undefined
      }).unwrap(),
      '新增接口失败'
    );
    if (!response) return;
    await interfaceListQuery.refetch();
    message.success('接口已新增');
  }

  async function handleUpdateInterface() {
    if (selectedProjectId <= 0) return;
    const interfaceId = Number(interfaceIdAction);
    const catid = Number(catIdAction);
    if (!Number.isFinite(interfaceId) || interfaceId <= 0) {
      message.error('请输入有效接口ID');
      return;
    }
    const payload: Record<string, unknown> = {
      id: interfaceId,
      project_id: selectedProjectId,
      token: accessToken || undefined
    };
    if (interfaceTitle.trim()) payload.title = interfaceTitle.trim();
    if (interfacePath.trim()) payload.path = interfacePath.trim();
    payload.method = interfaceMethod;
    if (Number.isFinite(catid) && catid > 0) {
      payload.catid = catid;
    }
    const response = await callApi(updateInterface(payload as any).unwrap(), '更新接口失败');
    if (!response) return;
    await interfaceListQuery.refetch();
    message.success('接口已更新');
  }

  async function handleDelInterface() {
    if (selectedProjectId <= 0) return;
    const interfaceId = Number(interfaceIdAction);
    if (!Number.isFinite(interfaceId) || interfaceId <= 0) {
      message.error('请输入有效接口ID');
      return;
    }
    const response = await callApi(
      delInterface({
        id: interfaceId,
        project_id: selectedProjectId,
        catid: Number.isFinite(Number(catIdAction)) ? Number(catIdAction) : undefined,
        token: accessToken || undefined
      }).unwrap(),
      '删除接口失败'
    );
    if (!response) return;
    await interfaceListQuery.refetch();
    message.success('接口已删除');
  }

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card title="用户登录与会话状态">
        <Row gutter={16}>
          <Col span={12}>
            <Form layout="vertical" onFinish={handleLogin}>
              <Form.Item label="邮箱">
                <Input value={email} onChange={e => setEmail(e.target.value)} />
              </Form.Item>
              <Form.Item label="密码">
                <Input.Password value={password} onChange={e => setPassword(e.target.value)} />
              </Form.Item>
              <Space>
                <Button type="primary" htmlType="submit" loading={loginState.isLoading}>
                  登录
                </Button>
                <Button onClick={handleLogout} loading={logoutState.isLoading}>
                  退出
                </Button>
              </Space>
            </Form>
          </Col>
          <Col span={12}>
            {isLoggedIn ? (
              <Descriptions bordered size="small" column={1} title="当前用户">
                <Descriptions.Item label="UID">
                  {statusQuery.data?.data?._id || statusQuery.data?.data?.uid}
                </Descriptions.Item>
                <Descriptions.Item label="用户名">{statusQuery.data?.data?.username}</Descriptions.Item>
                <Descriptions.Item label="角色">{statusQuery.data?.data?.role}</Descriptions.Item>
                <Descriptions.Item label="邮箱">{statusQuery.data?.data?.email}</Descriptions.Item>
              </Descriptions>
            ) : (
              <Alert type="warning" showIcon message={statusQuery.data?.errmsg || '未登录'} />
            )}
          </Col>
        </Row>
      </Card>

      <Card title="分组与项目">
        <Space style={{ marginBottom: 12 }}>
          <span>分组</span>
          <Select<number>
            style={{ minWidth: 220 }}
            value={groupId > 0 ? groupId : undefined}
            onChange={value => setGroupId(value)}
            options={groups.map(group => ({
              value: group._id,
              label: `${group.group_name} (${group.type || 'public'})`
            }))}
            placeholder="选择分组"
          />
          <Button onClick={() => groupListQuery.refetch()} disabled={!isLoggedIn}>
            刷新分组
          </Button>
          <Button onClick={() => projectListQuery.refetch()} disabled={!isLoggedIn || groupId <= 0}>
            刷新项目
          </Button>
          <Button onClick={() => followListQuery.refetch()} disabled={!isLoggedIn}>
            刷新关注
          </Button>
        </Space>

        <Row gutter={12} style={{ marginBottom: 12 }}>
          <Col span={6}>
            <Input
              value={newProjectName}
              onChange={e => setNewProjectName(e.target.value)}
              placeholder="新项目名称"
              disabled={!isLoggedIn || groupId <= 0}
            />
          </Col>
          <Col span={6}>
            <Input
              value={newProjectBasepath}
              onChange={e => setNewProjectBasepath(e.target.value)}
              placeholder="/api/new"
              disabled={!isLoggedIn || groupId <= 0}
            />
          </Col>
          <Col span={4}>
            <Select<'public' | 'private'>
              style={{ width: '100%' }}
              value={newProjectType}
              onChange={value => setNewProjectType(value)}
              disabled={!isLoggedIn || groupId <= 0}
              options={[
                { value: 'private', label: 'private' },
                { value: 'public', label: 'public' }
              ]}
            />
          </Col>
          <Col span={8}>
            <Space>
              <Button
                onClick={handleCheckProjectName}
                loading={checkProjectNameState.isFetching}
                disabled={!isLoggedIn || groupId <= 0}
              >
                校验项目名
              </Button>
              <Button
                type="primary"
                onClick={handleAddProject}
                loading={addProjectState.isLoading}
                disabled={!isLoggedIn || groupId <= 0}
              >
                创建项目
              </Button>
            </Space>
          </Col>
        </Row>

        <Row gutter={12} style={{ marginBottom: 12 }}>
          <Col span={6}>
            <Input
              value={copyProjectName}
              onChange={e => setCopyProjectName(e.target.value)}
              placeholder="复制后项目名"
              disabled={!isLoggedIn || groupId <= 0 || selectedProjectId <= 0}
            />
          </Col>
          <Col span={6}>
            <Input
              value={copyProjectBasepath}
              onChange={e => setCopyProjectBasepath(e.target.value)}
              placeholder="/api/copy"
              disabled={!isLoggedIn || groupId <= 0 || selectedProjectId <= 0}
            />
          </Col>
          <Col span={4}>
            <Select<'public' | 'private'>
              style={{ width: '100%' }}
              value={copyProjectType}
              onChange={value => setCopyProjectType(value)}
              disabled={!isLoggedIn || groupId <= 0 || selectedProjectId <= 0}
              options={[
                { value: 'private', label: 'private' },
                { value: 'public', label: 'public' }
              ]}
            />
          </Col>
          <Col span={8}>
            <Button
              onClick={handleCopyProject}
              loading={copyProjectState.isLoading}
              disabled={!isLoggedIn || groupId <= 0 || selectedProjectId <= 0}
            >
              复制当前项目
            </Button>
          </Col>
        </Row>

        <Table
          size="small"
          rowKey="_id"
          loading={
            projectListQuery.isLoading || addFollowState.isLoading || delFollowState.isLoading
          }
          dataSource={projectRows}
          pagination={false}
          columns={[
            { title: '项目ID', dataIndex: '_id', width: 100 },
            { title: '名称', dataIndex: 'name' },
            {
              title: '类型',
              dataIndex: 'project_type',
              width: 100,
              render: (value: string) => (
                <Tag color={value === 'private' ? 'gold' : 'blue'}>{value || 'public'}</Tag>
              )
            },
            {
              title: '关注',
              dataIndex: 'follow',
              width: 100,
              render: (value: boolean) =>
                value ? <Tag color="green">已关注</Tag> : <Tag color="default">未关注</Tag>
            },
            {
              title: '操作',
              width: 280,
              render: (_value, row) => (
                <Space>
                  <Button size="small" onClick={() => setSelectedProjectId(row._id)}>
                    查看/编辑
                  </Button>
                  {row.follow ? (
                    <Button
                      size="small"
                      danger
                      onClick={() => handleDelFollow(row._id)}
                      loading={delFollowState.isLoading}
                    >
                      取消关注
                    </Button>
                  ) : (
                    <Button
                      size="small"
                      onClick={() => handleAddFollow(row._id)}
                      loading={addFollowState.isLoading}
                    >
                      关注
                    </Button>
                  )}
                </Space>
              )
            }
          ]}
        />
      </Card>

      <Card title="关注项目（follow/list）">
        <Table
          size="small"
          rowKey="key"
          loading={followListQuery.isLoading}
          dataSource={followRows}
          pagination={false}
          columns={[
            { title: '项目ID', dataIndex: 'projectid', width: 100 },
            { title: '项目名', dataIndex: 'projectname' },
            {
              title: '颜色',
              dataIndex: 'color',
              width: 120,
              render: (value: string) => value || '-'
            },
            {
              title: '操作',
              width: 180,
              render: (_value, row) => (
                <Space>
                  <Button size="small" onClick={() => setSelectedProjectId(row.projectid)}>
                    打开项目
                  </Button>
                  <Button size="small" danger onClick={() => handleDelFollow(row.projectid)}>
                    取消关注
                  </Button>
                </Space>
              )
            }
          ]}
        />
      </Card>

      <Card title={`项目详情 ${selectedProjectId > 0 ? `(ID=${selectedProjectId})` : ''}`}>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Space>
            <Button onClick={() => projectDetailQuery.refetch()} disabled={selectedProjectId <= 0}>
              刷新详情
            </Button>
            <Button
              onClick={() => projectTokenQuery.refetch()}
              disabled={selectedProjectId <= 0 || !isLoggedIn}
            >
              获取 Token
            </Button>
            <Button
              onClick={handleUpdateToken}
              loading={updateTokenState.isLoading}
              disabled={selectedProjectId <= 0 || !isLoggedIn}
            >
              更新 Token
            </Button>
            <Button
              danger
              onClick={handleDelProject}
              loading={delProjectState.isLoading}
              disabled={selectedProjectId <= 0 || !isLoggedIn}
            >
              删除项目
            </Button>
          </Space>

          <Input.TextArea
            rows={2}
            value={accessToken || projectTokenQuery.data?.data || ''}
            onChange={e => setAccessToken(e.target.value)}
            placeholder="项目访问 token"
          />

          {projectDetailQuery.data?.errcode === 0 ? (
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="项目名">{projectDetailQuery.data.data?.name}</Descriptions.Item>
              <Descriptions.Item label="类型">{projectDetailQuery.data.data?.project_type}</Descriptions.Item>
              <Descriptions.Item label="角色">{projectDetailQuery.data.data?.role || '-'}</Descriptions.Item>
              <Descriptions.Item label="分类数">
                {projectDetailQuery.data.data?.cat?.length || 0}
              </Descriptions.Item>
            </Descriptions>
          ) : (
            <Paragraph type="secondary" style={{ margin: 0 }}>
              {projectDetailQuery.data?.errmsg || '请选择项目查看详情'}
            </Paragraph>
          )}
        </Space>
      </Card>

      <Card title="项目配置编辑">
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Row gutter={12}>
            <Col span={6}>
              <Input
                value={projectName}
                onChange={e => setProjectName(e.target.value)}
                placeholder="项目名称"
                disabled={selectedProjectId <= 0}
              />
            </Col>
            <Col span={6}>
              <Input
                value={projectBasepath}
                onChange={e => setProjectBasepath(e.target.value)}
                placeholder="/api/v1"
                disabled={selectedProjectId <= 0}
              />
            </Col>
            <Col span={6}>
              <Input
                value={projectDesc}
                onChange={e => setProjectDesc(e.target.value)}
                placeholder="项目描述"
                disabled={selectedProjectId <= 0}
              />
            </Col>
            <Col span={3}>
              <Input
                value={projectIcon}
                onChange={e => setProjectIcon(e.target.value)}
                placeholder="icon"
                disabled={selectedProjectId <= 0}
              />
            </Col>
            <Col span={3}>
              <Input
                value={projectColor}
                onChange={e => setProjectColor(e.target.value)}
                placeholder="#1890ff"
                disabled={selectedProjectId <= 0}
              />
            </Col>
          </Row>
          <Space>
            <Button
              type="primary"
              onClick={handleUpdateProject}
              loading={updateProjectState.isLoading}
              disabled={selectedProjectId <= 0}
            >
              更新项目基础信息
            </Button>
            <Button
              onClick={handleUpsetProject}
              loading={upsetProjectState.isLoading}
              disabled={selectedProjectId <= 0}
            >
              更新图标/颜色
            </Button>
          </Space>

          <Input.TextArea
            rows={6}
            value={envText}
            onChange={e => setEnvText(e.target.value)}
            placeholder='[{"name":"local","domain":"http://127.0.0.1"}]'
            disabled={selectedProjectId <= 0}
          />
          <Button
            onClick={handleUpdateEnv}
            loading={updateProjectEnvState.isLoading}
            disabled={selectedProjectId <= 0}
          >
            更新环境配置
          </Button>

          <Input.TextArea
            rows={4}
            value={tagText}
            onChange={e => setTagText(e.target.value)}
            placeholder='[{"name":"订单","desc":"订单域"}]'
            disabled={selectedProjectId <= 0}
          />
          <Button
            onClick={handleUpdateTag}
            loading={updateProjectTagState.isLoading}
            disabled={selectedProjectId <= 0}
          >
            更新标签
          </Button>
        </Space>
      </Card>

      <Card title="项目成员管理">
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Row gutter={12}>
            <Col span={10}>
              <Input
                value={memberUidsText}
                onChange={e => setMemberUidsText(e.target.value)}
                placeholder="待添加 member_uids，如 2,3,4"
                disabled={selectedProjectId <= 0}
              />
            </Col>
            <Col span={6}>
              <Select<'owner' | 'dev' | 'guest'>
                style={{ width: '100%' }}
                value={memberRole}
                onChange={value => setMemberRole(value)}
                disabled={selectedProjectId <= 0}
                options={[
                  { value: 'owner', label: 'owner' },
                  { value: 'dev', label: 'dev' },
                  { value: 'guest', label: 'guest' }
                ]}
              />
            </Col>
            <Col span={8}>
              <Button
                onClick={handleAddProjectMembers}
                loading={addProjectMemberState.isLoading}
                disabled={selectedProjectId <= 0}
              >
                添加成员
              </Button>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={8}>
              <Input
                value={memberUidAction}
                onChange={e => setMemberUidAction(e.target.value)}
                placeholder="单个 member_uid"
                disabled={selectedProjectId <= 0}
              />
            </Col>
            <Col span={4}>
              <Select<boolean>
                style={{ width: '100%' }}
                value={memberNotice}
                onChange={value => setMemberNotice(value)}
                disabled={selectedProjectId <= 0}
                options={[
                  { value: true as any, label: '通知开启' },
                  { value: false as any, label: '通知关闭' }
                ]}
              />
            </Col>
            <Col span={12}>
              <Space>
                <Button
                  onClick={handleChangeProjectMemberRole}
                  loading={changeProjectMemberRoleState.isLoading}
                  disabled={selectedProjectId <= 0}
                >
                  修改角色
                </Button>
                <Button
                  onClick={handleChangeProjectMemberEmailNotice}
                  loading={changeProjectMemberEmailNoticeState.isLoading}
                  disabled={selectedProjectId <= 0}
                >
                  邮件通知
                </Button>
                <Button
                  danger
                  onClick={handleDelProjectMember}
                  loading={delProjectMemberState.isLoading}
                  disabled={selectedProjectId <= 0}
                >
                  删除成员
                </Button>
                <Button onClick={() => projectMemberListQuery.refetch()} disabled={selectedProjectId <= 0}>
                  刷新成员
                </Button>
              </Space>
            </Col>
          </Row>

          <Table
            size="small"
            rowKey={row => `${row.uid}`}
            loading={projectMemberListQuery.isLoading}
            dataSource={projectMemberListQuery.data?.data || []}
            pagination={false}
            columns={[
              { title: 'UID', dataIndex: 'uid', width: 90 },
              { title: '用户名', dataIndex: 'username' },
              { title: '邮箱', dataIndex: 'email' },
              { title: '角色', dataIndex: 'role', width: 120 }
            ]}
          />
        </Space>
      </Card>

      <Card title="项目搜索（project/search）">
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Space style={{ width: '100%' }}>
            <Input
              value={searchKeyword}
              onChange={e => setSearchKeyword(e.target.value)}
              placeholder="输入关键词（项目名/分组名/接口名）"
            />
            <Button onClick={handleSearchProject} loading={searchProjectState.isFetching}>
              搜索
            </Button>
          </Space>
          <Input.TextArea rows={8} value={searchResultText} readOnly placeholder="搜索结果 JSON" />
        </Space>
      </Card>

      <Card title="Swagger URL 拉取（project/swagger_url）">
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Space style={{ width: '100%' }}>
            <Input
              value={swaggerUrl}
              onChange={e => setSwaggerUrl(e.target.value)}
              placeholder="https://example.com/openapi.json"
            />
            <Button onClick={handleFetchSwagger} loading={fetchSwaggerState.isFetching}>
              拉取
            </Button>
          </Space>
          <Input.TextArea rows={8} value={swaggerPreviewText} readOnly placeholder="Swagger 数据预览" />
        </Space>
      </Card>

      <Card title="接口分类管理">
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Row gutter={12}>
            <Col span={6}>
              <Select
                style={{ width: '100%' }}
                value={catIdAction || undefined}
                onChange={value => setCatIdAction(String(value))}
                disabled={selectedProjectId <= 0}
                placeholder="选择分类"
                options={catRows.map(item => ({
                  value: item._id,
                  label: `${item.name} (#${item._id})`
                }))}
              />
            </Col>
            <Col span={6}>
              <Input
                value={catName}
                onChange={e => setCatName(e.target.value)}
                placeholder="分类名"
                disabled={selectedProjectId <= 0}
              />
            </Col>
            <Col span={8}>
              <Input
                value={catDesc}
                onChange={e => setCatDesc(e.target.value)}
                placeholder="分类描述"
                disabled={selectedProjectId <= 0}
              />
            </Col>
            <Col span={4}>
              <Space>
                <Button
                  onClick={handleAddCat}
                  loading={addInterfaceCatState.isLoading}
                  disabled={selectedProjectId <= 0}
                >
                  新增
                </Button>
                <Button
                  onClick={handleUpdateCat}
                  loading={updateInterfaceCatState.isLoading}
                  disabled={selectedProjectId <= 0}
                >
                  更新
                </Button>
              </Space>
            </Col>
          </Row>
          <Space>
            <Button
              danger
              onClick={handleDelCat}
              loading={delInterfaceCatState.isLoading}
              disabled={selectedProjectId <= 0}
            >
              删除当前分类
            </Button>
            <Button onClick={() => catMenuQuery.refetch()} disabled={selectedProjectId <= 0}>
              刷新分类
            </Button>
          </Space>
          <Table
            size="small"
            rowKey="_id"
            loading={catMenuQuery.isLoading}
            dataSource={catRows}
            pagination={false}
            columns={[
              { title: '分类ID', dataIndex: '_id', width: 100 },
              { title: '名称', dataIndex: 'name' },
              { title: '描述', dataIndex: 'desc' },
              { title: 'Index', dataIndex: 'index', width: 90 }
            ]}
          />
        </Space>
      </Card>

      <Card title="接口管理（兼容接口 CRUD）">
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Row gutter={12}>
            <Col span={4}>
              <Input
                value={interfaceIdAction}
                onChange={e => setInterfaceIdAction(e.target.value)}
                placeholder="接口ID(更新/删除)"
                disabled={selectedProjectId <= 0}
              />
            </Col>
            <Col span={5}>
              <Input
                value={interfaceTitle}
                onChange={e => setInterfaceTitle(e.target.value)}
                placeholder="接口标题"
                disabled={selectedProjectId <= 0}
              />
            </Col>
            <Col span={7}>
              <Input
                value={interfacePath}
                onChange={e => setInterfacePath(e.target.value)}
                placeholder="/api/demo/path"
                disabled={selectedProjectId <= 0}
              />
            </Col>
            <Col span={3}>
              <Select<'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'>
                style={{ width: '100%' }}
                value={interfaceMethod}
                onChange={value => setInterfaceMethod(value)}
                disabled={selectedProjectId <= 0}
                options={[
                  { value: 'GET', label: 'GET' },
                  { value: 'POST', label: 'POST' },
                  { value: 'PUT', label: 'PUT' },
                  { value: 'DELETE', label: 'DELETE' },
                  { value: 'PATCH', label: 'PATCH' }
                ]}
              />
            </Col>
            <Col span={5}>
              <Space>
                <Button
                  onClick={handleAddInterface}
                  loading={addInterfaceState.isLoading}
                  disabled={selectedProjectId <= 0}
                >
                  新增接口
                </Button>
                <Button
                  onClick={handleUpdateInterface}
                  loading={updateInterfaceState.isLoading}
                  disabled={selectedProjectId <= 0}
                >
                  更新接口
                </Button>
                <Button
                  danger
                  onClick={handleDelInterface}
                  loading={delInterfaceState.isLoading}
                  disabled={selectedProjectId <= 0}
                >
                  删除接口
                </Button>
              </Space>
            </Col>
          </Row>
          <Button onClick={() => interfaceListQuery.refetch()} disabled={selectedProjectId <= 0}>
            刷新接口列表
          </Button>
          <Table
            size="small"
            rowKey={row => `${row._id}`}
            loading={interfaceListQuery.isLoading}
            dataSource={interfaceRows}
            pagination={false}
            columns={[
              { title: '接口ID', dataIndex: '_id', width: 90 },
              { title: '标题', dataIndex: 'title' },
              { title: '方法', dataIndex: 'method', width: 90 },
              { title: '路径', dataIndex: 'path' },
              { title: '分类', dataIndex: 'catid', width: 90 },
              { title: '状态', dataIndex: 'status', width: 100 }
            ]}
          />
        </Space>
      </Card>
    </Space>
  );
}
