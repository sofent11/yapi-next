import { Alert, Badge, Button, Card, Select, Stack, Table, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconCopy,
  IconEdit,
  IconFileImport,
  IconPlus,
  IconTrash
} from '@tabler/icons-react';
import { FilterBar } from '../../../components/layout';
import { getHttpMethodBadgeClassName, normalizeHttpMethod } from '../../../utils/http-method';
import type {
  AutoTestReport,
  AutoTestResultRow,
  CaseEnvProject,
  CollectionCaseRow,
  CollectionRow
} from './collection-types';

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

function resultBadge(code?: number) {
  if (code === 0) return <Badge color="teal">通过</Badge>;
  if (code === 1) return <Badge color="yellow">失败</Badge>;
  if (typeof code === 'number' && code > 1) return <Badge color="red">异常</Badge>;
  return <Badge variant="light">未测试</Badge>;
}

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
      notifications.show({ color: 'teal', message: successText });
    } catch (_err) {
      notifications.show({ color: 'red', message: '复制失败，请手动复制' });
    }
  }

  return (
    <Card withBorder radius="lg" padding="lg">
      <Stack className="legacy-collection-overview-stack">
        <FilterBar
          className="legacy-interface-list-toolbar legacy-collection-overview-toolbar"
          left={
            <div className="min-w-0">
              <Text fw={700} className="legacy-collection-overview-title">
                {props.currentCol?.name || `测试集合 ${props.selectedColId}`}
              </Text>
              <Text c="dimmed" size="sm" className="legacy-collection-overview-desc">
                {props.currentCol?.desc || '暂无描述'}
              </Text>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="light">总用例 {props.caseRows.length}</Badge>
                <Badge color="blue" variant="light">已执行 {executedCount}</Badge>
                <Badge color="teal" variant="light">通过 {passedCount}</Badge>
                <Badge color="yellow" variant="light">失败 {failedCount}</Badge>
                <Badge color="red" variant="light">异常 {errorCount}</Badge>
                <Badge color="gray" variant="light">未测 {untestedCount}</Badge>
              </div>
            </div>
          }
          right={
            props.canEdit ? (
              <div className="legacy-collection-overview-actions flex flex-wrap gap-2">
                <Button leftSection={<IconPlus size={16} />} onClick={props.onOpenAddCase}>
                  添加用例
                </Button>
                <Button variant="default" leftSection={<IconFileImport size={16} />} onClick={props.onOpenImportInterface}>
                  导入接口
                </Button>
                <Button variant="default" leftSection={<IconEdit size={16} />} onClick={props.onOpenEditCollection}>
                  编辑集合
                </Button>
                <Button variant="default" onClick={props.onOpenCommonSetting}>
                  通用规则配置
                </Button>
                <Button variant="default" loading={props.autoTestRunning} onClick={props.onRunAutoTest}>
                  开始测试
                </Button>
                <Button variant="default" onClick={props.onViewReport}>
                  查看报告
                </Button>
                <Button variant="default" onClick={props.onDownloadReport}>
                  下载报告
                </Button>
              </div>
            ) : null
          }
        />

        {props.caseEnvProjects.length > 0 ? (
          <FilterBar
            className="legacy-interface-list-toolbar"
            left={
              <div className="flex flex-wrap items-center gap-3">
                <Text fw={600}>测试环境：</Text>
                {props.caseEnvProjects.map(item => {
                  const projectId = Number(item._id || 0);
                  return (
                    <div key={`env-${projectId}`} className="flex flex-wrap items-center gap-2">
                      <Text size="sm">{item.name || `项目${projectId}`}</Text>
                      <Select
                        className="legacy-collection-env-select"
                        clearable
                        value={props.selectedRunEnvByProject[projectId] || null}
                        onChange={value => props.onSetRunEnv(projectId, value || '')}
                        data={(item.env || []).map(envItem => ({
                          label: String(envItem.name || ''),
                          value: String(envItem.name || '')
                        }))}
                      />
                    </div>
                  );
                })}
              </div>
            }
          />
        ) : null}

        {props.autoTestReport ? (
          <Alert
            color="blue"
            title={props.autoTestReport.message?.msg || '已生成测试报告'}
          >
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
              <span>总数: {Number(props.autoTestReport.message?.len || props.autoTestRows.length || 0)}</span>
              <span>通过: {Number(props.autoTestReport.message?.successNum || 0)}</span>
              <span>失败: {Number(props.autoTestReport.message?.failedNum || 0)}</span>
              <span>耗时: {String(props.autoTestReport.runTime || '-')}</span>
              <Button size="xs" variant="default" onClick={() => void copyText(reportSummaryText, '报告摘要已复制')}>
                复制摘要
              </Button>
              <Button size="xs" variant="default" onClick={props.onOpenReportModal}>
                查看详情
              </Button>
            </div>
          </Alert>
        ) : null}

        <div className="overflow-x-auto">
          <Table striped highlightOnHover withTableBorder className="legacy-collection-case-table">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>用例名称</Table.Th>
                <Table.Th>接口</Table.Th>
                <Table.Th>更新时间</Table.Th>
                <Table.Th>状态</Table.Th>
                <Table.Th>测试报告</Table.Th>
                <Table.Th>操作</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {props.caseListLoading ? (
                <Table.Tr>
                  <Table.Td colSpan={6}>
                    <Text c="dimmed" ta="center" py="md">
                      加载中...
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : props.caseRows.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={6}>
                    <Text c="dimmed" ta="center" py="md">
                      当前集合暂无测试用例
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : (
                props.caseRows.map(row => {
                  const caseId = String(row._id || '');
                  const report = props.autoTestResultMap.get(caseId);
                  return (
                    <Table.Tr
                      key={caseId}
                      className={
                        report
                          ? Number(report.code || -1) === 0
                            ? 'legacy-collection-case-row-pass'
                            : Number(report.code || -1) === 1
                              ? 'legacy-collection-case-row-fail'
                              : 'legacy-collection-case-row-error'
                          : ''
                      }
                      onClick={() => props.onNavigateCase(caseId)}
                    >
                      <Table.Td>
                        <button
                          type="button"
                          className="legacy-interface-menu-link-btn"
                          onClick={event => {
                            event.stopPropagation();
                            props.onNavigateCase(caseId);
                          }}
                        >
                          {String(row.casename || row._id || '-')}
                        </button>
                      </Table.Td>
                      <Table.Td>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={getHttpMethodBadgeClassName(row.method)}>
                            {normalizeHttpMethod(String(row.method || 'GET'))}
                          </span>
                          <span className="legacy-interface-path-text">{String(row.path || row.title || '-')}</span>
                        </div>
                      </Table.Td>
                      <Table.Td>{row.up_time ? new Date(Number(row.up_time) * 1000).toLocaleString() : '-'}</Table.Td>
                      <Table.Td>{resultBadge(report ? Number(report.code || -1) : undefined)}</Table.Td>
                      <Table.Td>
                        {report ? (
                          <Button
                            size="xs"
                            variant="default"
                            onClick={event => {
                              event.stopPropagation();
                              props.onOpenReportDetail(report);
                            }}
                          >
                            查看
                          </Button>
                        ) : (
                          '-'
                        )}
                      </Table.Td>
                      <Table.Td>
                        {props.canEdit ? (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="xs"
                              variant="default"
                              loading={props.autoTestRunning}
                              onClick={event => {
                                event.stopPropagation();
                                props.onRunCaseTest(caseId);
                              }}
                            >
                              测试
                            </Button>
                            <Button
                              size="xs"
                              variant="default"
                              onClick={event => {
                                event.stopPropagation();
                                props.onCopyCase(caseId);
                              }}
                            >
                              <IconCopy size={14} />
                            </Button>
                            <Button
                              size="xs"
                              color="red"
                              variant="light"
                              onClick={event => {
                                event.stopPropagation();
                                props.onDeleteCase(caseId);
                              }}
                            >
                              <IconTrash size={14} />
                            </Button>
                          </div>
                        ) : (
                          '-'
                        )}
                      </Table.Td>
                    </Table.Tr>
                  );
                })
              )}
            </Table.Tbody>
          </Table>
        </div>
      </Stack>
    </Card>
  );
}
