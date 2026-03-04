import { useEffect, useMemo, useState } from 'react';
import type { InterfaceTreeNode, LegacyInterfaceDTO } from '@yapi-next/shared-types';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Input,
  InputNumber,
  Pagination,
  Row,
  Select,
  Space,
  Tag,
  Tree,
  Typography,
  message
} from 'antd';
import type { DataNode, EventDataNode } from 'antd/es/tree';
import {
  useGetInterfaceTreeQuery,
  useLazyGetInterfaceTreeNodeQuery,
  useLazyGetInterfaceQuery,
  useUpdateInterfaceMutation
} from '../services/yapi-api';

const { Text, Paragraph } = Typography;

type TreeNodeMeta =
  | { type: 'category'; catid: number }
  | { type: 'interface'; interfaceData: LegacyInterfaceDTO };

type TreeNodeWithMeta = DataNode & {
  meta?: TreeNodeMeta;
};

const CAT_PREFIX = 'cat:';

function parseCatId(key: string): number | undefined {
  if (!key.startsWith(CAT_PREFIX)) return undefined;
  const value = Number(key.slice(CAT_PREFIX.length));
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return value;
}

export function InterfaceExplorerPage() {
  const [projectId, setProjectId] = useState<number>(11);
  const [token, setToken] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(50);
  const [expandedKeys, setExpandedKeys] = useState<Array<string | number>>([]);
  const [selectedInterface, setSelectedInterface] = useState<LegacyInterfaceDTO | null>(null);
  const [selectedInterfaceId, setSelectedInterfaceId] = useState<number>(0);
  const [interfaceDetail, setInterfaceDetail] = useState<LegacyInterfaceDTO | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [editPath, setEditPath] = useState<string>('');
  const [editMethod, setEditMethod] = useState<'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'>('GET');
  const [editStatus, setEditStatus] = useState<'done' | 'undone'>('undone');
  const [editDesc, setEditDesc] = useState<string>('');
  const [editTagText, setEditTagText] = useState<string>('');
  const [nodeCache, setNodeCache] = useState<Record<number, LegacyInterfaceDTO[]>>({});

  const treeQuery = useGetInterfaceTreeQuery(
    {
      projectId,
      token: token || undefined,
      page,
      limit,
      includeList: false,
      detail: 'summary'
    },
    { skip: projectId <= 0 }
  );

  const [loadNode, loadNodeState] = useLazyGetInterfaceTreeNodeQuery();
  const [loadInterface, loadInterfaceState] = useLazyGetInterfaceQuery();
  const [updateInterface, updateInterfaceState] = useUpdateInterfaceMutation();

  useEffect(() => {
    setNodeCache({});
    setExpandedKeys([]);
    setSelectedInterface(null);
    setSelectedInterfaceId(0);
    setInterfaceDetail(null);
  }, [projectId, token]);

  const categories = (treeQuery.data?.data?.list || []) as InterfaceTreeNode[];
  const total = Number(treeQuery.data?.data?.count || 0);

  const treeData = useMemo<TreeNodeWithMeta[]>(() => {
    return categories.map(category => {
      const catid = Number(category._id);
      const key = `${CAT_PREFIX}${catid}`;
      const interfaces = nodeCache[catid];
      const count = Number(category.interface_count || 0);
      const children =
        interfaces?.map((item, index) => ({
          key: `iface:${catid}:${item._id || index}`,
          title: (
            <Space size={8}>
              <Tag color="blue">{item.method || 'GET'}</Tag>
              <Text>{item.path || '-'}</Text>
              <Text type="secondary">{item.title || ''}</Text>
            </Space>
          ),
          isLeaf: true,
          meta: {
            type: 'interface',
            interfaceData: item
          } as TreeNodeMeta
        })) || (count > 0
          ? [
            {
              key: `${key}:loading`,
              title: <Text type="secondary">展开后加载接口...</Text>,
              isLeaf: true,
              selectable: false
            }
          ]
          : []);
      return {
        key,
        title: (
          <Space size={8}>
            <Text strong>{category.name}</Text>
            <Tag>{count}</Tag>
          </Space>
        ),
        isLeaf: count <= 0,
        children,
        meta: {
          type: 'category',
          catid
        } as TreeNodeMeta
      };
    });
  }, [categories, nodeCache]);

  async function handleLoadNode(node: EventDataNode<TreeNodeWithMeta>): Promise<void> {
    const key = String(node.key);
    const catid = parseCatId(key);
    if (!catid) return;
    if (nodeCache[catid]) return;

    try {
      const response = await loadNode({
        catid,
        token: token || undefined,
        page: 1,
        limit: 500,
        detail: 'summary'
      }).unwrap();
      if (response.errcode !== 0) {
        message.error(response.errmsg || '加载分类接口失败');
        setNodeCache(prev => ({ ...prev, [catid]: [] }));
        return;
      }
      setNodeCache(prev => ({
        ...prev,
        [catid]: response.data?.list || []
      }));
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载分类接口失败');
      setNodeCache(prev => ({ ...prev, [catid]: [] }));
    }
  }

  function handleSelect(_selectedKeys: Array<string | number>, info: { node: TreeNodeWithMeta }) {
    const meta = info.node.meta;
    if (!meta || meta.type !== 'interface') {
      return;
    }
    const interfaceId = Number(meta.interfaceData._id || 0);
    setSelectedInterface(meta.interfaceData);
    setSelectedInterfaceId(interfaceId);
    setInterfaceDetail(null);
    applyEditableFields(meta.interfaceData);
    if (interfaceId > 0) {
      void fetchInterfaceDetail(interfaceId);
    }
  }

  function handleRefresh() {
    treeQuery.refetch();
    setNodeCache({});
    setExpandedKeys([]);
    setSelectedInterface(null);
    setSelectedInterfaceId(0);
    setInterfaceDetail(null);
  }

  async function fetchInterfaceDetail(interfaceId: number) {
    try {
      const response = await loadInterface({
        id: interfaceId,
        projectId: projectId > 0 ? projectId : undefined,
        token: token || undefined
      }).unwrap();
      if (response.errcode !== 0) {
        message.warning(response.errmsg || '获取接口详情失败');
        return;
      }
      const detail = response.data || null;
      setInterfaceDetail(detail);
      if (detail) {
        applyEditableFields(detail);
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : '获取接口详情失败');
    }
  }

  async function handleUpdateInterface() {
    if (selectedInterfaceId <= 0) {
      message.error('请先选择一个接口');
      return;
    }
    if (!editTitle.trim()) {
      message.error('标题不能为空');
      return;
    }
    if (!editPath.trim()) {
      message.error('路径不能为空');
      return;
    }
    const tags = editTagText
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
    const response = await updateInterface({
      id: selectedInterfaceId,
      title: editTitle.trim(),
      path: editPath.trim(),
      method: editMethod,
      status: editStatus,
      desc: editDesc,
      tag: tags,
      token: token || undefined
    }).unwrap();
    if (response.errcode !== 0) {
      message.error(response.errmsg || '更新接口失败');
      return;
    }
    message.success('接口已更新');
    syncLocalInterfaceCache({
      _id: selectedInterfaceId,
      title: editTitle.trim(),
      path: editPath.trim(),
      method: editMethod,
      status: editStatus,
      desc: editDesc,
      tag: tags
    });
    await fetchInterfaceDetail(selectedInterfaceId);
  }

  function applyEditableFields(data: LegacyInterfaceDTO) {
    setEditTitle(data.title || '');
    setEditPath(data.path || '');
    setEditMethod((data.method || 'GET') as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH');
    setEditStatus((data.status || 'undone') as 'done' | 'undone');
    setEditDesc(data.desc || '');
    setEditTagText((data.tag || []).join(','));
  }

  function syncLocalInterfaceCache(partial: Partial<LegacyInterfaceDTO> & { _id: number }) {
    setSelectedInterface(prev =>
      prev && Number(prev._id) === partial._id
        ? {
          ...prev,
          ...partial
        }
        : prev
    );
    setInterfaceDetail(prev =>
      prev && Number(prev._id) === partial._id
        ? {
          ...prev,
          ...partial
        }
        : prev
    );
    const catid = Number((interfaceDetail || selectedInterface)?.catid || 0);
    if (catid <= 0) return;
    setNodeCache(prev => ({
      ...prev,
      [catid]: (prev[catid] || []).map(item =>
        Number(item._id) === partial._id
          ? {
            ...item,
            ...partial
          }
          : item
      )
    }));
  }

  const currentInterface = interfaceDetail || selectedInterface;

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card>
        <Paragraph style={{ marginBottom: 8 }}>
          新版接口树浏览器：分类分页 + 节点懒加载 + 虚拟滚动，直接使用 `/interface/tree` 与 `/interface/tree/node`。
        </Paragraph>
        <Row gutter={12}>
          <Col span={5}>
            <Text>Project ID</Text>
            <InputNumber
              style={{ width: '100%', marginTop: 8 }}
              min={1}
              value={projectId}
              onChange={value => setProjectId(typeof value === 'number' ? value : 0)}
            />
          </Col>
          <Col span={9}>
            <Text>Token (私有项目必填)</Text>
            <Input
              style={{ marginTop: 8 }}
              value={token}
              onChange={event => setToken(event.target.value)}
              placeholder="project token"
            />
          </Col>
          <Col span={4}>
            <Text>分类分页大小</Text>
            <InputNumber
              style={{ width: '100%', marginTop: 8 }}
              min={10}
              max={200}
              value={limit}
              onChange={value => setLimit(typeof value === 'number' ? value : 50)}
            />
          </Col>
          <Col span={6} style={{ display: 'flex', alignItems: 'end' }}>
            <Button type="primary" onClick={handleRefresh} loading={treeQuery.isFetching}>
              刷新分类树
            </Button>
          </Col>
        </Row>
      </Card>

      {treeQuery.data?.errcode && treeQuery.data.errcode !== 0 ? (
        <Alert type="error" showIcon message={treeQuery.data.errmsg || '加载分类失败'} />
      ) : null}

      <Row gutter={16}>
        <Col span={14}>
          <Card
            title={`分类树（第 ${page} 页，${categories.length} 个分类）`}
            extra={<Text type="secondary">节点加载中: {loadNodeState.isFetching ? '是' : '否'}</Text>}
          >
            <Tree<TreeNodeWithMeta>
              virtual
              blockNode
              height={560}
              treeData={treeData}
              loadData={handleLoadNode}
              expandedKeys={expandedKeys}
              onExpand={keys => setExpandedKeys(keys as any)}
              onSelect={handleSelect as any}
            />
            <div style={{ marginTop: 12 }}>
              <Pagination
                size="small"
                current={page}
                total={total}
                pageSize={limit}
                onChange={current => setPage(current)}
                showSizeChanger={false}
              />
            </div>
          </Card>
        </Col>
        <Col span={10}>
          <Card
            title="接口详情与编辑"
            extra={
              <Space>
                <Button
                  size="small"
                  disabled={selectedInterfaceId <= 0}
                  loading={loadInterfaceState.isFetching}
                  onClick={() => {
                    if (selectedInterfaceId > 0) {
                      void fetchInterfaceDetail(selectedInterfaceId);
                    }
                  }}
                >
                  刷新详情
                </Button>
                <Button
                  size="small"
                  type="primary"
                  disabled={selectedInterfaceId <= 0}
                  loading={updateInterfaceState.isLoading}
                  onClick={handleUpdateInterface}
                >
                  保存更新
                </Button>
              </Space>
            }
          >
            {currentInterface ? (
              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                <Descriptions size="small" column={1} bordered>
                  <Descriptions.Item label="ID">{currentInterface._id || '-'}</Descriptions.Item>
                  <Descriptions.Item label="标题">{currentInterface.title || '-'}</Descriptions.Item>
                  <Descriptions.Item label="方法">
                    <Tag color="blue">{currentInterface.method || 'GET'}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="路径">{currentInterface.path || '-'}</Descriptions.Item>
                  <Descriptions.Item label="状态">{currentInterface.status || '-'}</Descriptions.Item>
                  <Descriptions.Item label="分类">{currentInterface.catid || '-'}</Descriptions.Item>
                  <Descriptions.Item label="Tag">
                    {(currentInterface.tag || []).length > 0
                      ? (currentInterface.tag || []).map(item => <Tag key={item}>{item}</Tag>)
                      : '-'}
                  </Descriptions.Item>
                </Descriptions>

                <Text strong>编辑字段</Text>
                <Input value={editTitle} onChange={event => setEditTitle(event.target.value)} placeholder="标题" />
                <Input value={editPath} onChange={event => setEditPath(event.target.value)} placeholder="/api/path" />
                <Row gutter={8}>
                  <Col span={12}>
                    <Select<'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'>
                      style={{ width: '100%' }}
                      value={editMethod}
                      onChange={value => setEditMethod(value)}
                      options={[
                        { value: 'GET', label: 'GET' },
                        { value: 'POST', label: 'POST' },
                        { value: 'PUT', label: 'PUT' },
                        { value: 'DELETE', label: 'DELETE' },
                        { value: 'PATCH', label: 'PATCH' }
                      ]}
                    />
                  </Col>
                  <Col span={12}>
                    <Select<'done' | 'undone'>
                      style={{ width: '100%' }}
                      value={editStatus}
                      onChange={value => setEditStatus(value)}
                      options={[
                        { value: 'done', label: 'done' },
                        { value: 'undone', label: 'undone' }
                      ]}
                    />
                  </Col>
                </Row>
                <Input
                  value={editTagText}
                  onChange={event => setEditTagText(event.target.value)}
                  placeholder="tag1,tag2"
                />
                <Input.TextArea
                  rows={4}
                  value={editDesc}
                  onChange={event => setEditDesc(event.target.value)}
                  placeholder="接口描述"
                />
              </Space>
            ) : (
              <Alert type="info" showIcon message="点击接口节点查看详情" />
            )}
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
