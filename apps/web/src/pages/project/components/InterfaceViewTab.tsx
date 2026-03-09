import { useMemo, useState } from 'react';
import { ActionIcon, Avatar, Badge, Button, Table, Text, Tooltip } from '@mantine/core';
import { IconChevronDown, IconChevronRight, IconCopy } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { CopyableTextPanel } from '../../../components/patterns/CopyableTextPanel';
import { InfoGrid, InfoGridItem } from '../../../components/patterns/InfoGrid';
import type { InterfaceDTO } from '../../../types/interface-dto';
import { SectionCard } from '../../../components/layout/SectionCard';
import { sanitizeHtml } from '../../../utils/html-sanitize';
import { apiPath } from '../../../utils/base-path';

type ParamRow = Record<string, unknown>;
type ParamColumns = Array<Record<string, unknown>>;
type SchemaTableRow = Record<string, unknown> & {
  key?: string;
  name?: string;
  type?: string;
  children?: SchemaTableRow[];
};
type VisibleSchemaRow = {
  row: SchemaTableRow;
  depth: number;
  key: string;
  hasChildren: boolean;
};

type InterfaceViewTabProps = {
  currentInterface: InterfaceDTO;
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
  onCopySwaggerJson: (interfaceId: number) => void;
  onCopyOpenApiJson: (interfaceId: number) => void;
  copyingSpec: boolean;
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
    <div className="interface-view-block space-y-3">
      <h3 className="interface-view-subtitle text-base font-semibold text-[var(--text-primary)]">{title}</h3>
      <div className="overflow-x-auto rounded-2xl border border-[var(--border-subtle)] dark:!border-[var(--border-project-subtle)]">
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

function getRequestBodyLabel(currentInterface: InterfaceDTO, hasSchemaRows: boolean): string {
  const rawType = String(currentInterface.req_body_type || 'raw').toLowerCase();
  if (hasSchemaRows && rawType === 'raw') {
    return 'json-schema';
  }
  return rawType || 'raw';
}

function normalizeSchemaChildren(input: unknown): SchemaTableRow[] {
  if (!Array.isArray(input)) return [];
  return input.filter((item): item is SchemaTableRow => Boolean(item) && typeof item === 'object');
}

function flattenSchemaRows(
  rows: SchemaTableRow[],
  expandedKeys: Set<string>,
  depth = 0
): VisibleSchemaRow[] {
  return rows.flatMap((row, index) => {
    const key = String(row.key || `${depth}-${index}-${String(row.name || 'row')}`);
    const children = normalizeSchemaChildren(row.children);
    const rowType = String(row.type || '').toLowerCase();
    const hasChildren = children.length > 0 && (rowType === 'object' || rowType === 'array');
    const current: VisibleSchemaRow = { row, depth, key, hasChildren };
    if (!hasChildren || !expandedKeys.has(key)) {
      return [current];
    }
    return [current, ...flattenSchemaRows(children, expandedKeys, depth + 1)];
  });
}

function SchemaParamTable(props: { title: string; columns: ParamColumns; rows: SchemaTableRow[] }) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());

  const visibleRows = useMemo(
    () => flattenSchemaRows(props.rows, expandedKeys),
    [props.rows, expandedKeys]
  );

  const toggleExpanded = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <div className="interface-view-block space-y-3">
      <h3 className="interface-view-subtitle text-base font-semibold text-[var(--text-primary)]">{props.title}</h3>
      <div className="overflow-x-auto rounded-2xl border border-[var(--border-subtle)] dark:!border-[var(--border-project-subtle)]">
        <Table withTableBorder striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              {props.columns.map((column, index) => (
                <Table.Th key={`${props.title}-head-${String(column.key || column.dataIndex || index)}`}>
                  {String(column.title || '-')}
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {visibleRows.map(({ row, depth, key, hasChildren }) => {
              const expanded = hasChildren && expandedKeys.has(key);
              return (
                <Table.Tr key={key}>
                  {props.columns.map((column, columnIndex) => {
                    const columnKey = String(column.key || column.dataIndex || columnIndex);
                    const isNameColumn = String(column.dataIndex || '') === 'name';
                    return (
                      <Table.Td key={`${key}-${columnKey}`}>
                        {isNameColumn ? (
                          <div className="flex items-center gap-2" style={{ paddingLeft: `${depth * 18}px` }}>
                            <ActionIcon
                              variant="subtle"
                              size="sm"
                              onClick={() => hasChildren && toggleExpanded(key)}
                              disabled={!hasChildren}
                              aria-label={expanded ? '收起子级字段' : '展开子级字段'}
                            >
                              {hasChildren ? (
                                expanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />
                              ) : (
                                <span className="block h-4 w-4" />
                              )}
                            </ActionIcon>
                            <span className={depth > 0 ? 'font-mono text-[13px]' : undefined}>
                              {String(row.name || '-')}
                            </span>
                          </div>
                        ) : (
                          renderCell(row, column)
                        )}
                      </Table.Td>
                    );
                  })}
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </div>
    </div>
  );
}

export function InterfaceViewTab(props: InterfaceViewTabProps) {
  const uid = Number((props.currentInterface as unknown as Record<string, unknown>).uid || 0);
  const tags = Array.isArray(props.currentInterface.tag)
    ? props.currentInterface.tag.map(item => String(item)).filter(Boolean)
    : [];
  const mockFlag = props.mockFlagText(props.projectIsMockOpen, props.projectStrict);
  const interfaceId = Number(props.currentInterface._id || 0);
  const hasRequestParams =
    props.reqParamsRows.length > 0 ||
    props.reqHeadersRows.length > 0 ||
    props.reqQueryRows.length > 0 ||
    props.reqBodyFormRows.length > 0 ||
    Boolean(props.currentInterface.req_body_other);

  return (
    <div className="caseContainer space-y-4">
      <div className="flex flex-col gap-4 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-panel)] p-5 text-[var(--text-primary)] shadow-[var(--shadow-panel)] dark:!border-[var(--border-project-subtle)] dark:!bg-[var(--surface-project-panel)]">
        {/* Top Info Row */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4 dark:border-[var(--border-project-subtle)]">
          <div className="flex flex-wrap items-center gap-3">
            <Badge 
              variant="light"
              color={props.currentInterface.status === 'done' ? 'teal' : 'yellow'} 
              size="md" 
              radius="sm"
            >
              {props.statusLabel(props.currentInterface.status)}
            </Badge>
            <span className="text-lg font-bold text-[var(--text-primary)]">{props.currentInterface.title || '-'}</span>
            {tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 ml-1">
                {tags.map(tag => (
                  <Badge key={tag} variant="outline" color="gray" size="sm" radius="sm">
                    {tag}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
          
          <div className="flex items-center gap-4 text-[13px] text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">创建人:</span>
              {uid > 0 ? (
                <Link
                  className="inline-flex items-center gap-1.5 text-slate-600 transition-colors hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-300"
                  to={`/user/profile/${uid}`}
                >
                  <Avatar size={18} src={apiPath(`user/avatar?uid=${uid}`)} radius="xl" />
                  {String((props.currentInterface as unknown as Record<string, unknown>).username || '-')}
                </Link>
              ) : (
                <span className="text-slate-600 dark:text-slate-300">
                  {String((props.currentInterface as unknown as Record<string, unknown>).username || '-')}
                </span>
              )}
            </div>
            <div className="h-3 w-px bg-[var(--border-subtle)] dark:!bg-[var(--border-project-subtle)]"></div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">更新于:</span>
              <span className="text-slate-600 dark:text-slate-300">
                {props.formatUnixTime((props.currentInterface as unknown as Record<string, unknown>).up_time)}
              </span>
            </div>
          </div>
        </div>

        {/* Path and Mock Details */}
        <div className="flex flex-col gap-3">
          {/* Path Row */}
          <div className="flex items-center gap-4">
            <div className="w-16 shrink-0 text-right text-[13px] font-medium text-slate-500 dark:text-slate-400">接口路径</div>
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-100 bg-[var(--surface-subtle)] px-3 py-1.5 dark:!border-[var(--border-project-subtle)] dark:!bg-[var(--surface-project-subtle)]">
              <span className={`${props.methodClassName(props.method)} text-[12px] font-bold leading-none shrink-0`}>{props.method}</span>
              <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-slate-700 dark:text-slate-300">{props.fullPath}</code>
              <ActionIcon 
                size="sm" 
                variant="subtle" 
                color="gray"
                onClick={() => props.onCopyText(props.fullPath, '接口路径已复制')}
                title="复制路径"
                aria-label="复制接口路径"
              >
                <IconCopy size={14} />
              </ActionIcon>
            </div>
          </div>

          {/* Mock URL Row */}
          <div className="flex items-center gap-4">
            <div className="w-16 shrink-0 text-right text-[13px] font-medium text-slate-500 dark:text-slate-400">Mock</div>
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-100 bg-[var(--surface-subtle)] px-3 py-1.5 dark:!border-[var(--border-project-subtle)] dark:!bg-[var(--surface-project-subtle)]">
              {mockFlag ? (
                <span className="shrink-0 rounded px-1.5 py-0.5 text-[12px] font-medium text-amber-600 bg-amber-50 dark:bg-amber-500/20 dark:text-amber-200">
                  {mockFlag}
                </span>
              ) : null}
              {props.mockUrl ? (
                <a
                  href={props.mockUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 truncate font-mono text-[13px] text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-300 dark:hover:text-blue-200"
                >
                  {props.mockUrl}
                </a>
              ) : (
                <span className="min-w-0 flex-1 text-[13px] text-slate-400">-</span>
              )}
              {props.mockUrl ? (
                <ActionIcon 
                  size="sm" 
                  variant="subtle" 
                  color="gray"
                  onClick={() => props.onCopyText(props.mockUrl, 'Mock地址已复制')}
                  title="复制Mock地址"
                  aria-label="复制 Mock 地址"
                >
                  <IconCopy size={14} />
                </ActionIcon>
              ) : null}
            </div>
          </div>

          {/* Custom Field Row (if applicable) */}
          {props.customField?.enable && String(props.currentInterface.custom_field_value || '').trim() ? (
            <div className="flex items-center gap-4">
              <div className="w-16 shrink-0 text-right text-[13px] font-medium text-slate-500 dark:text-slate-400">{props.customField.name || '自定义'}</div>
              <div className="flex min-w-0 flex-1 items-center rounded-lg border border-slate-100 bg-[var(--surface-subtle)] px-3 py-1.5 text-[13px] text-slate-700 dark:!border-[var(--border-project-subtle)] dark:!bg-[var(--surface-project-subtle)] dark:text-slate-300">
                {String(props.currentInterface.custom_field_value || '')}
              </div>
            </div>
          ) : null}

          {/* Actions Row */}
          <div className="flex items-center gap-4 mt-1">
            <div className="w-16 shrink-0 text-right text-[13px] font-medium text-slate-500 dark:text-slate-400">规格导出</div>
            <div className="flex flex-1 items-center gap-2">
              <Button
                size="xs"
                variant="default"
                radius="md"
                className="bg-[var(--surface-panel)] font-medium hover:bg-[var(--surface-hover)] dark:!bg-[var(--surface-project-elevated)] dark:hover:brightness-110"
                onClick={() => props.onCopySwaggerJson(interfaceId)}
                loading={props.copyingSpec}
                disabled={interfaceId <= 0}
              >
                复制 Swagger
              </Button>
              <Button
                size="xs"
                variant="default"
                radius="md"
                className="bg-[var(--surface-panel)] font-medium hover:bg-[var(--surface-hover)] dark:!bg-[var(--surface-project-elevated)] dark:hover:brightness-110"
                onClick={() => props.onCopyOpenApiJson(interfaceId)}
                loading={props.copyingSpec}
                disabled={interfaceId <= 0}
              >
                复制 OpenAPI
              </Button>
            </div>
          </div>
        </div>
      </div>

      {props.currentInterface.desc ? (
        <SectionCard title="备注" className="interface-view-section">
          <div
            className="interface-view-remark"
            dangerouslySetInnerHTML={{
              __html: sanitizeHtml(String(props.currentInterface.desc || ''))
            }}
          />
        </SectionCard>
      ) : null}

      {hasRequestParams ? (
        <SectionCard title="请求参数" className="interface-view-section">
          {props.reqParamsRows.length > 0 ? renderParamTable('路径参数', props.paramColumns, props.reqParamsRows) : null}
          {props.reqHeadersRows.length > 0 ? renderParamTable('Headers', props.paramColumns, props.reqHeadersRows) : null}
          {props.reqQueryRows.length > 0 ? renderParamTable('Query', props.paramColumns, props.reqQueryRows) : null}
          {props.reqBodyFormRows.length > 0 ? renderParamTable('Body(form)', props.bodyParamColumns, props.reqBodyFormRows) : null}
          {props.currentInterface.req_body_other ? (
            <div className="interface-view-block space-y-3">
              <h3 className="interface-view-subtitle text-base font-semibold text-slate-900 dark:text-slate-100">
                Body({getRequestBodyLabel(props.currentInterface, props.schemaRowsRequest.length > 0)})
              </h3>
              {props.schemaRowsRequest.length > 0 ? (
                <SchemaParamTable title="请求 Schema" columns={props.schemaColumns} rows={props.schemaRowsRequest as SchemaTableRow[]} />
              ) : (
                <CopyableTextPanel
                  title="原始 Body"
                  value={String(props.currentInterface.req_body_other || '')}
                  onCopy={() => props.onCopyText(String(props.currentInterface.req_body_other || ''), 'Body 内容已复制')}
                  rows={8}
                  monospace
                />
              )}
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      {props.currentInterface.res_body ? (
        <SectionCard title="返回数据" className="interface-view-section">
          <div className="interface-view-block">
            {props.schemaRowsResponse.length > 0 ? (
              <SchemaParamTable title="响应 Schema" columns={props.schemaColumns} rows={props.schemaRowsResponse as SchemaTableRow[]} />
            ) : (
              <CopyableTextPanel
                title="原始响应"
                value={String(props.currentInterface.res_body || '')}
                onCopy={() => props.onCopyText(String(props.currentInterface.res_body || ''), '返回数据已复制')}
                rows={10}
                monospace
              />
            )}
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
