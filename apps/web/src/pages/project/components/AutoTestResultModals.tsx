import { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Modal, Table, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCopy } from '@tabler/icons-react';
import { AdaptiveDataView } from '../../../components/patterns/AdaptiveDataView';
import { CopyableTextPanel } from '../../../components/patterns/CopyableTextPanel';
import { DataPagination } from '../../../components/patterns/DataPagination';
import { InfoGrid, InfoGridItem } from '../../../components/patterns/InfoGrid';

type AutoTestResultItem = {
  id: string;
  name: string;
  path: string;
  code: number;
  validRes?: Array<{ message?: string }>;
  status?: number | null;
  statusText?: string;
  url?: string;
  method?: string;
  params?: Record<string, unknown>;
  res_header?: unknown;
  res_body?: unknown;
};

type AutoTestReport = {
  message?: {
    msg?: string;
    len?: number;
    successNum?: number;
    failedNum?: number;
  };
  runTime?: string;
};

export type AutoTestResultModalsProps = {
  reportOpen: boolean;
  onCloseReport: () => void;
  detailItem: AutoTestResultItem | null;
  onCloseDetail: () => void;
  report: AutoTestReport | null;
  rows: AutoTestResultItem[];
  onOpenDetail: (item: AutoTestResultItem) => void;
  methodClassName: (method?: string) => string;
};

const message = {
  success(text: string) {
    notifications.show({ color: 'teal', message: text });
  },
  error(text: string) {
    notifications.show({ color: 'red', message: text });
  }
};

function stringifyPretty(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch (_err) {
    return String(value ?? '');
  }
}

function resultBadge(code: number) {
  if (code === 0) return { color: 'teal', label: '通过' };
  if (code === 1) return { color: 'yellow', label: '失败' };
  return { color: 'red', label: '异常' };
}

export function AutoTestResultModals(props: AutoTestResultModalsProps) {
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const detailItem = props.detailItem;

  useEffect(() => {
    if (!props.reportOpen) {
      setPage(1);
    }
  }, [props.reportOpen]);

  const totalPages = Math.max(1, Math.ceil(props.rows.length / pageSize));
  const visibleRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return props.rows.slice(start, start + pageSize);
  }, [page, props.rows]);

  const reportSummaryText = [
    `总数: ${Number(props.report?.message?.len || props.rows.length || 0)}`,
    `通过: ${Number(props.report?.message?.successNum || 0)}`,
    `失败: ${Number(props.report?.message?.failedNum || 0)}`,
    `耗时: ${String(props.report?.runTime || '-')}`
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
    <>
      <Modal title="服务端测试结果" opened={props.reportOpen} onClose={props.onCloseReport} size="80rem">
        <div className="flex flex-col gap-4">
          <Alert color="blue" title={props.report?.message?.msg || '暂无测试结果'}>
            <div className="flex flex-wrap items-center gap-3">
              <span>总数: {Number(props.report?.message?.len || props.rows.length || 0)}</span>
              <span>通过: {Number(props.report?.message?.successNum || 0)}</span>
              <span>失败: {Number(props.report?.message?.failedNum || 0)}</span>
              <span>耗时: {String(props.report?.runTime || '-')}</span>
              <Button
                size="xs"
                variant="default"
                leftSection={<IconCopy size={14} />}
                onClick={() => void copyText(reportSummaryText, '报告摘要已复制')}
              >
                复制摘要
              </Button>
            </div>
          </Alert>

          <AdaptiveDataView
            desktop={
              <div className="overflow-x-auto">
                <Table className="report-table" striped highlightOnHover withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>用例</Table.Th>
                      <Table.Th>接口</Table.Th>
                      <Table.Th>HTTP</Table.Th>
                      <Table.Th>结果</Table.Th>
                      <Table.Th>信息</Table.Th>
                      <Table.Th>操作</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {visibleRows.length === 0 ? (
                      <Table.Tr>
                        <Table.Td colSpan={6}>
                          <Text c="dimmed" ta="center" py="lg">
                            暂无可展示的测试结果
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ) : (
                      visibleRows.map(row => {
                        const badge = resultBadge(row.code);
                        return (
                          <Table.Tr
                            key={String(row.id || `${row.method || 'GET'}:${row.path || ''}`)}
                            className={
                              row.code === 0
                                ? 'report-row-pass'
                                : row.code === 1
                                  ? 'report-row-fail'
                                  : 'report-row-error'
                            }
                            onClick={() => props.onOpenDetail(row)}
                          >
                            <Table.Td>{row.name || row.id}</Table.Td>
                            <Table.Td>
                              <div className="flex items-center gap-2">
                                <span className={props.methodClassName(row.method || 'GET')}>
                                  {String(row.method || 'GET').toUpperCase()}
                                </span>
                                <span>{row.path || '-'}</span>
                              </div>
                            </Table.Td>
                            <Table.Td>{row.status == null ? '-' : String(row.status)}</Table.Td>
                            <Table.Td>
                              <Badge color={badge.color} variant="light">
                                {badge.label}
                              </Badge>
                            </Table.Td>
                            <Table.Td>
                              {(row.validRes || [])
                                .map(item => String(item?.message || ''))
                                .filter(Boolean)
                                .join(' | ') || row.statusText || '-'}
                            </Table.Td>
                            <Table.Td>
                              <Button
                                size="xs"
                                variant="default"
                                onClick={event => {
                                  event.stopPropagation();
                                  props.onOpenDetail(row);
                                }}
                              >
                                详情
                              </Button>
                            </Table.Td>
                          </Table.Tr>
                        );
                      })
                    )}
                  </Table.Tbody>
                </Table>
              </div>
            }
            mobile={
              visibleRows.length === 0 ? (
                <div className="adaptive-data-empty">暂无可展示的测试结果</div>
              ) : (
                visibleRows.map(row => {
                  const badge = resultBadge(row.code);
                  return (
                    <div
                      key={`mobile-report-${String(row.id || `${row.method || 'GET'}:${row.path || ''}`)}`}
                      className={`adaptive-data-card ${
                        row.code === 0 ? 'adaptive-data-card-pass' : row.code === 1 ? 'adaptive-data-card-fail' : 'adaptive-data-card-error'
                      }`}
                      onClick={() => props.onOpenDetail(row)}
                    >
                      <div className="adaptive-data-card-head">
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900 dark:text-slate-100">{row.name || row.id}</div>
                          <div className="flex items-center gap-2">
                            <span className={props.methodClassName(row.method || 'GET')}>
                              {String(row.method || 'GET').toUpperCase()}
                            </span>
                            <span className="truncate text-sm text-slate-600 dark:text-slate-300">{row.path || '-'}</span>
                          </div>
                        </div>
                        <Badge color={badge.color} variant="light">
                          {badge.label}
                        </Badge>
                      </div>
                      <div className="adaptive-data-card-grid">
                        <div>
                          <span className="adaptive-data-card-label">HTTP</span>
                          <span>{row.status == null ? '-' : String(row.status)}</span>
                        </div>
                        <div>
                          <span className="adaptive-data-card-label">信息</span>
                          <span>
                            {(row.validRes || [])
                              .map(item => String(item?.message || ''))
                              .filter(Boolean)
                              .join(' | ') || row.statusText || '-'}
                          </span>
                        </div>
                      </div>
                      <div className="adaptive-data-card-actions" onClick={event => event.stopPropagation()}>
                        <Button size="xs" variant="default" onClick={() => props.onOpenDetail(row)}>
                          详情
                        </Button>
                      </div>
                    </div>
                  );
                })
              )
            }
          />

          <DataPagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />

          <div className="flex justify-end">
            <Button variant="default" onClick={props.onCloseReport}>
              关闭
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        title={`测试详情 ${detailItem?.name || ''}`}
        opened={!!detailItem}
        onClose={props.onCloseDetail}
        size="72rem"
      >
        {detailItem ? (
          <div className="auto-test-detail-stack flex flex-col gap-4">
            <div className="workspace-section-head flex items-center justify-between gap-3">
              <Text fw={600}>基础信息</Text>
              <Button
                size="xs"
                variant="default"
                leftSection={<IconCopy size={14} />}
                onClick={() => void copyText(stringifyPretty(detailItem), '测试详情已复制')}
              >
                复制全部
              </Button>
            </div>

            <InfoGrid>
              <InfoGridItem label="用例ID" value={detailItem.id || '-'} />
              <InfoGridItem label="接口地址" value={detailItem.url || detailItem.path || '-'} />
              <InfoGridItem label="方法" value={String(detailItem.method || '-')} />
              <InfoGridItem
                label="HTTP 状态"
                value={detailItem.status == null ? '-' : String(detailItem.status)}
              />
              <InfoGridItem
                label="执行结果"
                value={detailItem.code === 0 ? '通过' : detailItem.code === 1 ? '失败' : '异常'}
              />
            </InfoGrid>

            <div className="auto-test-detail-block">
              <CopyableTextPanel
                title="校验信息"
                value={(detailItem.validRes || []).map(item => item?.message || '').join('\n') || '-'}
                onCopy={() =>
                  void copyText(
                    (detailItem.validRes || []).map(item => item?.message || '').join('\n') || '-',
                    '校验信息已复制'
                  )
                }
                rows={5}
              />
            </div>
            <div className="auto-test-detail-block">
              <CopyableTextPanel
                title="请求参数"
                value={stringifyPretty(detailItem.params)}
                onCopy={() => void copyText(stringifyPretty(detailItem.params), '请求参数已复制')}
                monospace
              />
            </div>
            <div className="auto-test-detail-block">
              <CopyableTextPanel
                title="响应头"
                value={stringifyPretty(detailItem.res_header)}
                onCopy={() => void copyText(stringifyPretty(detailItem.res_header), '响应头已复制')}
                monospace
              />
            </div>
            <div className="auto-test-detail-block">
              <CopyableTextPanel
                title="响应体"
                value={stringifyPretty(detailItem.res_body)}
                onCopy={() => void copyText(stringifyPretty(detailItem.res_body), '响应体已复制')}
                rows={10}
                monospace
              />
            </div>

            <div className="flex justify-end">
              <Button variant="default" onClick={props.onCloseDetail}>
                关闭
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
