import { Alert, Button, Card, Select, Space, Table, Tag, Typography, message } from 'antd';
import { CopyOutlined, DeleteOutlined, EditOutlined, ImportOutlined, PlusOutlined } from '@ant-design/icons';
import { FilterBar } from '../../../components/layout';
import { getHttpMethodBadgeClassName, normalizeHttpMethod } from '../../../utils/http-method';
import type {
  AutoTestReport,
  AutoTestResultRow,
  CaseEnvProject,
  CollectionCaseRow,
  CollectionRow
} from './collection-types';

const { Text } = Typography;

type CollectionOverviewPanelProps = {
  selectedColId: number;
  currentCol: CollectionRow | null;
  canEdit: boolean;
  autoTestRunning: boolean;
  autoTestReport: AutoTestReport | null;
  autoTestRows: AutoTestResultRow[];
  caseRows: CollectionCaseRow[];
  caseListLoading: boolean;
  caseEnvProjects: CaseEnvProject[];
  selectedRunEnvByProject: Record<string, string>;
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
  const executedCount = props.autoTestResultMap.size;
  const passedCount = Array.from(props.autoTestResultMap.values()).filter(item => Number(item.code || -1) === 0).length;
  const failedCount = Array.from(props.autoTestResultMap.values()).filter(item => Number(item.code || -1) === 1).length;
  const errorCount = Array.from(props.autoTestResultMap.values()).filter(item => Number(item.code || -1) > 1).length;
  const untestedCount = Math.max(props.caseRows.length - executedCount, 0);
  const reportSummaryText = [
    `集合: ${props.currentCol?.name || `测试集合 ${props.selectedColId}`}`,
    `总用例: ${props.caseRows.length}`,
    `已执行: ${executedCount}`,
    `通过: ${passedCount}`,
    `失败: ${failedCount}`,
    `异常: ${errorCount}`,
    `未测: ${untestedCount}`
  ].join('\n');

  async function copyText(text: string, successText: string) {
    try {
      await navigator.clipboard.writeText(text);
      message.success(successText);
    } catch (_err) {
      message.error('复制失败，请手动复制');
    }
  }

  return (
    <Card>
      <Space direction="vertical" className="legacy-collection-overview-stack">
        <FilterBar
          className="legacy-interface-list-toolbar legacy-collection-overview-toolbar"
          left={
            <Space direction="vertical" size={4} className="legacy-collection-overview-main">
              <Text strong className="legacy-collection-overview-title">
                {props.currentCol?.name || `测试集合 ${props.selectedColId}`}
              </Text>
              <Text type="secondary" className="legacy-collection-overview-desc">
                {props.currentCol?.desc || '暂无描述'}
              </Text>
              <Space wrap size={6} className="legacy-collection-overview-stats">
                <Tag color="default">总用例 {props.caseRows.length}</Tag>
                <Tag color="processing">已执行 {executedCount}</Tag>
                <Tag color="success">通过 {passedCount}</Tag>
                <Tag color="warning">失败 {failedCount}</Tag>
                <Tag color="error">异常 {errorCount}</Tag>
                <Tag>未测 {untestedCount}</Tag>
              </Space>
            </Space>
          }
          right={
            props.canEdit ? (
              <div className="legacy-collection-overview-actions">
                <Space size={8} wrap className="legacy-collection-overview-actions-main">
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
                </Space>
                <Space size={8} wrap className="legacy-collection-overview-actions-run">
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
              </div>
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
                        className="legacy-collection-env-select"
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
                <Button size="small" onClick={() => void copyText(reportSummaryText, '报告摘要已复制')}>
                  复制摘要
                </Button>
                <Button size="small" onClick={props.onOpenReportModal}>
                  查看详情
                </Button>
              </Space>
            }
          />
        ) : null}
        <Table<CollectionCaseRow>
          className="legacy-collection-case-table"
          rowKey={row => String(row._id || '')}
          loading={props.caseListLoading}
          dataSource={props.caseRows}
          rowClassName={row => {
            const report = props.autoTestResultMap.get(String(row._id || ''));
            if (!report) return '';
            const code = Number(report.code || -1);
            if (code === 0) return 'legacy-collection-case-row-pass';
            if (code === 1) return 'legacy-collection-case-row-fail';
            return 'legacy-collection-case-row-error';
          }}
          onRow={row => ({
            onClick: () => props.onNavigateCase(String(row._id || ''))
          })}
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
                  onClick={event => {
                    event.stopPropagation();
                    props.onNavigateCase(String(row._id || ''));
                  }}
                >
                  {String(value || row._id || '-')}
                </button>
              )
            },
            {
              title: '接口',
              render: (_, row) => (
                <Space>
                  <span className={getHttpMethodBadgeClassName(row.method)}>
                    {normalizeHttpMethod(String(row.method || 'GET'))}
                  </span>
                  <span className="legacy-interface-path-text">{String(row.path || row.title || '-')}</span>
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
                  <Button
                    size="small"
                    onClick={event => {
                      event.stopPropagation();
                      props.onOpenReportDetail(report);
                    }}
                  >
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
                    <Button
                      size="small"
                      loading={props.autoTestRunning}
                      onClick={event => {
                        event.stopPropagation();
                        props.onRunCaseTest(String(row._id || ''));
                      }}
                    >
                      测试
                    </Button>
                    <Button
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={event => {
                        event.stopPropagation();
                        props.onCopyCase(String(row._id || ''));
                      }}
                    />
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={event => {
                        event.stopPropagation();
                        props.onDeleteCase(String(row._id || ''));
                      }}
                    />
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
