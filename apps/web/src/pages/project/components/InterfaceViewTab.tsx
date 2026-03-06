import { Avatar, Badge, Button, Table, Text, Tooltip } from '@mantine/core';
import { IconCopy } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import type { LegacyInterfaceDTO } from '@yapi-next/shared-types';
import { SectionCard } from '../../../components/layout/SectionCard';
import { sanitizeHtml } from '../../../utils/html-sanitize';

type ParamRow = Record<string, unknown>;
type ParamColumns = Array<Record<string, unknown>>;

type InterfaceViewTabProps = {
  currentInterface: LegacyInterfaceDTO;
  method: string;
  fullPath: string;
  mockUrl: string;
  projectIsMockOpen?: boolean;
  projectStrict?: boolean;
  customField?: { name?: string; enable?: boolean };
  reqParamsRows: ParamRow[];
  reqHeadersRows: ParamRow[];
  reqQueryRows: ParamRow[];
  reqBodyFormRows: ParamRow[];
  schemaRowsRequest: ParamRow[];
  schemaRowsResponse: ParamRow[];
  paramColumns: ParamColumns;
  bodyParamColumns: ParamColumns;
  schemaColumns: ParamColumns;
  methodClassName: (method?: string) => string;
  statusLabel: (status?: string) => string;
  formatUnixTime: (value: unknown) => string;
  mockFlagText: (mockOpen?: boolean, strict?: boolean) => string;
  onCopyText: (text: string, successText: string) => void;
};

function renderCell(record: ParamRow, column: Record<string, unknown>) {
  const render = column.render;
  const dataIndex = String(column.dataIndex || '');
  const value = dataIndex ? record[dataIndex] : undefined;
  if (typeof render === 'function') {
    return render(value, record, 0) as React.ReactNode;
  }
  return String(value || '-');
}

function renderParamTable(title: string, columns: ParamColumns, rows: ParamRow[]) {
  return (
    <div className="legacy-view-block space-y-3">
      <h3 className="legacy-view-subtitle text-base font-semibold text-slate-900">{title}</h3>
      <div className="overflow-x-auto rounded-2xl border border-slate-200">
        <Table withTableBorder striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              {columns.map((column, index) => (
                <Table.Th key={`${title}-head-${String(column.key || column.dataIndex || index)}`}>
                  {String(column.title || '-')}
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((row, rowIndex) => (
              <Table.Tr key={`${title}-${rowIndex}`}>
                {columns.map((column, columnIndex) => (
                  <Table.Td key={`${title}-${rowIndex}-${String(column.key || column.dataIndex || columnIndex)}`}>
                    {renderCell(row, column)}
                  </Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </div>
    </div>
  );
}

function InfoRow(props: { label: string; value: React.ReactNode; span?: boolean }) {
  return (
    <div className={props.span ? 'md:col-span-2' : ''}>
      <div className="text-sm text-slate-500">{props.label}</div>
      <div className="mt-1 text-sm text-slate-900">{props.value}</div>
    </div>
  );
}

export function InterfaceViewTab(props: InterfaceViewTabProps) {
  const uid = Number((props.currentInterface as unknown as Record<string, unknown>).uid || 0);
  const tags = Array.isArray(props.currentInterface.tag)
    ? props.currentInterface.tag.map(item => String(item)).filter(Boolean)
    : [];
  const mockFlag = props.mockFlagText(props.projectIsMockOpen, props.projectStrict);
  const hasRequestParams =
    props.reqParamsRows.length > 0 ||
    props.reqHeadersRows.length > 0 ||
    props.reqQueryRows.length > 0 ||
    props.reqBodyFormRows.length > 0 ||
    Boolean(props.currentInterface.req_body_other);

  return (
    <div className="caseContainer space-y-4">
      <SectionCard title="基本信息" className="panel-view legacy-view-panel">
        <div className="legacy-view-descriptions grid gap-4 md:grid-cols-2">
          <InfoRow
            label="接口名称"
            value={<span className="legacy-view-name" title={String(props.currentInterface.title || '-')}>{props.currentInterface.title || '-'}</span>}
          />
          <InfoRow
            label="创建人"
            value={
              uid > 0 ? (
                <Link className="user-name inline-flex items-center gap-2" to={`/user/profile/${uid}`}>
                  <Avatar className="user-img" size={28} src={`/api/user/avatar?uid=${uid}`} />
                  {String((props.currentInterface as unknown as Record<string, unknown>).username || '-')}
                </Link>
              ) : (
                String((props.currentInterface as unknown as Record<string, unknown>).username || '-')
              )
            }
          />
          <InfoRow
            label="状态"
            value={
              <span className={`legacy-status-tag ${props.currentInterface.status === 'done' ? 'done' : 'undone'}`}>
                {props.statusLabel(props.currentInterface.status)}
              </span>
            }
          />
          <InfoRow
            label="更新时间"
            value={props.formatUnixTime((props.currentInterface as unknown as Record<string, unknown>).up_time)}
          />
          {tags.length > 0 ? (
            <InfoRow
              label="Tag"
              span
              value={
                <div className="flex flex-wrap gap-2">
                  {tags.map(tag => (
                    <Badge key={tag} variant="light">{tag}</Badge>
                  ))}
                </div>
              }
            />
          ) : null}
          <InfoRow
            label="接口路径"
            span
            value={
              <div className="legacy-view-code-row flex flex-wrap items-center gap-2">
                <span className={`${props.methodClassName(props.method)} tag-method`}>{props.method}</span>
                <code className="legacy-view-code">{props.fullPath}</code>
                <Tooltip label="复制路径">
                  <Button
                    size="compact-sm"
                    variant="subtle"
                    onClick={() => props.onCopyText(props.fullPath, '接口路径已复制')}
                  >
                    <IconCopy size={14} />
                  </Button>
                </Tooltip>
              </div>
            }
          />
          <InfoRow
            label="Mock地址"
            span
            value={
              <div className="legacy-view-code-row flex flex-wrap items-center gap-2">
                {mockFlag ? <Text c="dimmed">{mockFlag}</Text> : null}
                {props.mockUrl ? (
                  <a href={props.mockUrl} target="_blank" rel="noopener noreferrer" className="legacy-view-link-btn">
                    {props.mockUrl}
                  </a>
                ) : (
                  <span className="legacy-view-link">-</span>
                )}
                {props.mockUrl ? (
                  <Tooltip label="复制Mock地址">
                    <Button
                      size="compact-sm"
                      variant="subtle"
                      onClick={() => props.onCopyText(props.mockUrl, 'Mock地址已复制')}
                    >
                      <IconCopy size={14} />
                    </Button>
                  </Tooltip>
                ) : null}
              </div>
            }
          />
          {props.customField?.enable && String(props.currentInterface.custom_field_value || '').trim() ? (
            <InfoRow
              label={props.customField.name || '自定义字段'}
              span
              value={String(props.currentInterface.custom_field_value || '')}
            />
          ) : null}
        </div>
      </SectionCard>

      {props.currentInterface.desc ? (
        <SectionCard title="备注" className="legacy-view-section">
          <div
            className="legacy-view-remark"
            dangerouslySetInnerHTML={{
              __html: sanitizeHtml(String(props.currentInterface.desc || ''))
            }}
          />
        </SectionCard>
      ) : null}

      {hasRequestParams ? (
        <SectionCard title="请求参数" className="legacy-view-section">
          {props.reqParamsRows.length > 0 ? renderParamTable('路径参数', props.paramColumns, props.reqParamsRows) : null}
          {props.reqHeadersRows.length > 0 ? renderParamTable('Headers', props.paramColumns, props.reqHeadersRows) : null}
          {props.reqQueryRows.length > 0 ? renderParamTable('Query', props.paramColumns, props.reqQueryRows) : null}
          {props.reqBodyFormRows.length > 0 ? renderParamTable('Body(form)', props.bodyParamColumns, props.reqBodyFormRows) : null}
          {props.currentInterface.req_body_other ? (
            <div className="legacy-view-block space-y-3">
              <h3 className="legacy-view-subtitle text-base font-semibold text-slate-900">
                Body({props.currentInterface.req_body_type || 'raw'})
              </h3>
              {props.schemaRowsRequest.length > 0 ? (
                renderParamTable('请求 Schema', props.schemaColumns, props.schemaRowsRequest)
              ) : (
                <div className="legacy-view-raw-block space-y-3">
                  <div className="legacy-run-section-head flex items-center justify-between gap-3">
                    <Text fw={700}>原始 Body</Text>
                    <Tooltip label="复制 Body 内容">
                      <Button
                        size="compact-sm"
                        variant="subtle"
                        onClick={() => props.onCopyText(String(props.currentInterface.req_body_other || ''), 'Body 内容已复制')}
                      >
                        <IconCopy size={14} />
                      </Button>
                    </Tooltip>
                  </div>
                  <textarea
                    className="min-h-[180px] w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"
                    value={String(props.currentInterface.req_body_other || '')}
                    readOnly
                  />
                </div>
              )}
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      {props.currentInterface.res_body ? (
        <SectionCard title="返回数据" className="legacy-view-section">
          <div className="legacy-view-block">
            {props.schemaRowsResponse.length > 0 ? (
              renderParamTable('响应 Schema', props.schemaColumns, props.schemaRowsResponse)
            ) : (
              <div className="legacy-view-raw-block space-y-3">
                <div className="legacy-run-section-head flex items-center justify-between gap-3">
                  <Text fw={700}>原始响应</Text>
                  <Tooltip label="复制返回数据">
                    <Button
                      size="compact-sm"
                      variant="subtle"
                      onClick={() => props.onCopyText(String(props.currentInterface.res_body || ''), '返回数据已复制')}
                    >
                      <IconCopy size={14} />
                    </Button>
                  </Tooltip>
                </div>
                <textarea
                  className="min-h-[240px] w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"
                  value={String(props.currentInterface.res_body || '')}
                  readOnly
                />
              </div>
            )}
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
