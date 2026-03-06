import { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Modal, Table, Text, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCopy } from '@tabler/icons-react';

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

function DetailSection(props: {
  title: string;
  value: string;
  onCopy: () => void;
  rows?: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="workspace-section-head flex items-center justify-between gap-3">
        <Text fw={600}>{props.title}</Text>
        <Button size="xs" variant="default" leftSection={<IconCopy size={14} />} onClick={props.onCopy}>
          复制
        </Button>
      </div>
      <Textarea minRows={props.rows || 6} readOnly value={props.value} />
    </div>
  );
}

export function AutoTestResultModals(props: AutoTestResultModalsProps) {
  const [page, setPage] = useState(1);
  const pageSize = 10;

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

          {totalPages > 1 ? (
            <div className="flex items-center justify-between gap-3">
              <Text c="dimmed" size="sm">
                第 {page} / {totalPages} 页
              </Text>
              <div className="flex gap-2">
                <Button size="xs" variant="default" disabled={page <= 1} onClick={() => setPage(current => Math.max(1, current - 1))}>
                  上一页
                </Button>
                <Button
                  size="xs"
                  variant="default"
                  disabled={page >= totalPages}
                  onClick={() => setPage(current => Math.min(totalPages, current + 1))}
                >
                  下一页
                </Button>
              </div>
            </div>
          ) : null}

          <div className="flex justify-end">
            <Button variant="default" onClick={props.onCloseReport}>
              关闭
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        title={`测试详情 ${props.detailItem?.name || ''}`}
        opened={!!props.detailItem}
        onClose={props.onCloseDetail}
        size="72rem"
      >
        {props.detailItem ? (
          <div className="flex flex-col gap-4">
            <div className="workspace-section-head flex items-center justify-between gap-3">
              <Text fw={600}>基础信息</Text>
              <Button
                size="xs"
                variant="default"
                leftSection={<IconCopy size={14} />}
                onClick={() => void copyText(stringifyPretty(props.detailItem), '测试详情已复制')}
              >
                复制全部
              </Button>
            </div>

            <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
              <div>
                <Text c="dimmed" size="sm">用例ID</Text>
                <Text>{props.detailItem.id || '-'}</Text>
              </div>
              <div>
                <Text c="dimmed" size="sm">接口地址</Text>
                <Text>{props.detailItem.url || props.detailItem.path || '-'}</Text>
              </div>
              <div>
                <Text c="dimmed" size="sm">方法</Text>
                <Text>{String(props.detailItem.method || '-')}</Text>
              </div>
              <div>
                <Text c="dimmed" size="sm">HTTP 状态</Text>
                <Text>{props.detailItem.status == null ? '-' : String(props.detailItem.status)}</Text>
              </div>
              <div>
                <Text c="dimmed" size="sm">执行结果</Text>
                <Text>{props.detailItem.code === 0 ? '通过' : props.detailItem.code === 1 ? '失败' : '异常'}</Text>
              </div>
            </div>

            <DetailSection
              title="校验信息"
              value={(props.detailItem.validRes || []).map(item => item?.message || '').join('\n') || '-'}
              onCopy={() =>
                void copyText(
                  (props.detailItem.validRes || []).map(item => item?.message || '').join('\n') || '-',
                  '校验信息已复制'
                )
              }
              rows={5}
            />
            <DetailSection
              title="请求参数"
              value={stringifyPretty(props.detailItem.params)}
              onCopy={() => void copyText(stringifyPretty(props.detailItem.params), '请求参数已复制')}
            />
            <DetailSection
              title="响应头"
              value={stringifyPretty(props.detailItem.res_header)}
              onCopy={() => void copyText(stringifyPretty(props.detailItem.res_header), '响应头已复制')}
            />
            <DetailSection
              title="响应体"
              value={stringifyPretty(props.detailItem.res_body)}
              onCopy={() => void copyText(stringifyPretty(props.detailItem.res_body), '响应体已复制')}
              rows={10}
            />

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
