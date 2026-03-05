import { Alert, Button, Card, Select, Space, Table, Tag, Typography } from 'antd';
import { CopyOutlined, DeleteOutlined, EditOutlined, ImportOutlined, PlusOutlined } from '@ant-design/icons';
import { FilterBar } from '../../../components/layout';

const { Text } = Typography;

type AutoTestReport = {
  message?: {
    msg?: string;
    len?: number;
    successNum?: number;
    failedNum?: number;
  };
  runTime?: string;
};

type AutoTestResultRow = {
  id: string;
  name: string;
  path: string;
  code: number;
  status?: number | null;
  statusText?: string;
  validRes?: Array<{ message?: string }>;
  params?: unknown;
  res_header?: unknown;
  res_body?: unknown;
};

type CaseRow = {
  _id?: string | number;
  casename?: string;
  method?: string;
  path?: string;
  title?: string;
  up_time?: number | string;
};

type CollectionOverviewPanelProps = {
  selectedColId: number;
  currentCol: { name?: string; desc?: string } | null;
  canEdit: boolean;
  autoTestRunning: boolean;
  autoTestReport: AutoTestReport | null;
  autoTestRows: AutoTestResultRow[];
  caseRows: CaseRow[];
  caseListLoading: boolean;
  caseEnvProjects: Array<{ _id?: number; name?: string; env?: Array<{ name?: string; domain?: string }> }>;
  selectedRunEnvByProject: Record<number, string>;
  autoTestResultMap: ReadonlyMap<string, AutoTestResultRow>;
  onSetRunEnv: (projectId: number, envName: string) => void;
  onOpenAddCase: () => void;
  onOpenImportInterface: () => void;
  onOpenEditCollection: () => void;
  onOpenCommonSetting: () => void;
  onRunAutoTest: () => void;
  onViewReport: () => void;
  onDownloadReport: () => void;
  onOpenReportModal: () => void;
  onOpenReportDetail: (item: AutoTestResultRow) => void;
  onNavigateCase: (caseId: string) => void;
  onRunCaseTest: (caseId: string) => void;
  onCopyCase: (caseId: string) => void;
  onDeleteCase: (caseId: string) => void;
};

export function CollectionOverviewPanel(props: CollectionOverviewPanelProps) {
  return (
    <Card>
      <Space direction="vertical" style={{ width: '100%' }}>
        <FilterBar
          className="legacy-interface-list-toolbar"
          left={
            <Space direction="vertical" size={2}>
              <Text strong>{props.currentCol?.name || `测试集合 ${props.selectedColId}`}</Text>
              <Text type="secondary">{props.currentCol?.desc || '暂无描述'}</Text>
            </Space>
          }
          right={
            props.canEdit ? (
              <Space size={8} wrap>
                <Button type="primary" icon={<PlusOutlined />} onClick={props.onOpenAddCase}>
                  添加用例
                </Button>
                <Button icon={<ImportOutlined />} onClick={props.onOpenImportInterface}>
                  导入接口
                </Button>
                <Button icon={<EditOutlined />} onClick={props.onOpenEditCollection}>
                  编辑集合
                </Button>
                <Button onClick={props.onOpenCommonSetting}>
                  通用规则配置
                </Button>
                <Button loading={props.autoTestRunning} onClick={props.onRunAutoTest}>
                  开始测试
                </Button>
                <Button onClick={props.onViewReport}>
                  查看报告
                </Button>
                <Button onClick={props.onDownloadReport}>
                  下载报告
                </Button>
              </Space>
            ) : null
          }
        />
        {props.caseEnvProjects.length > 0 ? (
          <FilterBar
            className="legacy-interface-list-toolbar"
            left={
              <Space size={12} wrap>
                <Text strong>测试环境：</Text>
                {props.caseEnvProjects.map(item => {
                  const projectId = Number(item._id || 0);
                  const options = (item.env || []).map(envItem => ({
                    label: String(envItem.name || ''),
                    value: String(envItem.name || '')
                  }));
                  return (
                    <Space key={`env-${projectId}`} size={6}>
                      <span>{item.name || `项目${projectId}`}</span>
                      <Select<string>
                        style={{ width: 180 }}
                        allowClear
                        value={props.selectedRunEnvByProject[projectId] || undefined}
                        options={options}
                        onChange={value => props.onSetRunEnv(projectId, value || '')}
                      />
                    </Space>
                  );
                })}
              </Space>
            }
          />
        ) : null}
        {props.autoTestReport ? (
          <Alert
            type="info"
            showIcon
            message={props.autoTestReport.message?.msg || '已生成测试报告'}
            description={
              <Space size={12} wrap>
                <span>总数: {Number(props.autoTestReport.message?.len || props.autoTestRows.length || 0)}</span>
                <span>通过: {Number(props.autoTestReport.message?.successNum || 0)}</span>
                <span>失败: {Number(props.autoTestReport.message?.failedNum || 0)}</span>
                <span>耗时: {String(props.autoTestReport.runTime || '-')}</span>
                <Button onClick={props.onOpenReportModal}>
                  查看详情
                </Button>
              </Space>
            }
          />
        ) : null}
        <Table<CaseRow>
          rowKey={row => String(row._id || '')}
          loading={props.caseListLoading}
          dataSource={props.caseRows}
          locale={{
            emptyText: '当前集合暂无测试用例'
          }}
          pagination={false}
          columns={[
            {
              title: '用例名称',
              dataIndex: 'casename',
              render: (value, row) => (
                <button
                  type="button"
                  className="legacy-interface-menu-link-btn"
                  onClick={() => props.onNavigateCase(String(row._id || ''))}
                >
                  {String(value || row._id || '-')}
                </button>
              )
            },
            {
              title: '接口',
              render: (_, row) => (
                <Space>
                  <Tag>{String(row.method || '-')}</Tag>
                  <span>{String(row.path || row.title || '-')}</span>
                </Space>
              )
            },
            {
              title: '更新时间',
              dataIndex: 'up_time',
              width: 180,
              render: value => (value ? new Date(Number(value) * 1000).toLocaleString() : '-')
            },
            {
              title: '状态',
              width: 100,
              render: (_, row) => {
                const report = props.autoTestResultMap.get(String(row._id || ''));
                if (!report) return <Tag>未测试</Tag>;
                const code = Number(report.code || -1);
                if (code === 0) return <Tag color="success">通过</Tag>;
                if (code === 1) return <Tag color="warning">失败</Tag>;
                return <Tag color="error">异常</Tag>;
              }
            },
            {
              title: '测试报告',
              width: 110,
              render: (_, row) => {
                const report = props.autoTestResultMap.get(String(row._id || ''));
                return report ? (
                  <Button onClick={() => props.onOpenReportDetail(report)}>
                    查看
                  </Button>
                ) : (
                  '-'
                );
              }
            },
            {
              title: '操作',
              width: 180,
              render: (_, row) =>
                props.canEdit ? (
                  <Space size={4}>
                    <Button loading={props.autoTestRunning} onClick={() => props.onRunCaseTest(String(row._id || ''))}>
                      测试
                    </Button>
                    <Button icon={<CopyOutlined />} onClick={() => props.onCopyCase(String(row._id || ''))} />
                    <Button danger icon={<DeleteOutlined />} onClick={() => props.onDeleteCase(String(row._id || ''))} />
                  </Space>
                ) : (
                  '-'
                )
            }
          ]}
        />
      </Space>
    </Card>
  );
}
