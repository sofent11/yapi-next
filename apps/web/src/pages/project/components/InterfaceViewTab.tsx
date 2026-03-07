import { useMemo, useState } from 'react';
import { ActionIcon, Avatar, Badge, Button, Table, Text, Tooltip } from '@mantine/core';
import { IconChevronDown, IconChevronRight, IconCopy } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { CopyableTextPanel } from '../../../components/patterns/CopyableTextPanel';
import { InfoGrid, InfoGridItem } from '../../../components/patterns/InfoGrid';
import type { InterfaceDTO } from '../../../types/interface-dto';
import { SectionCard } from '../../../components/layout/SectionCard';
import { sanitizeHtml } from '../../../utils/html-sanitize';

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
      <h3 className="interface-view-subtitle text-base font-semibold text-slate-900">{title}</h3>
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
      <h3 className="interface-view-subtitle text-base font-semibold text-slate-900">{props.title}</h3>
      <div className="overflow-x-auto rounded-2xl border border-slate-200">
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
      <SectionCard title="基本信息" className="panel-view interface-view-panel">
        <InfoGrid className="interface-view-descriptions">
          <InfoGridItem
            label="接口名称"
            value={<span className="interface-view-name" title={String(props.currentInterface.title || '-')}>{props.currentInterface.title || '-'}</span>}
          />
          <InfoGridItem
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
          <InfoGridItem
            label="状态"
            value={
              <span className={`status-chip ${props.currentInterface.status === 'done' ? 'done' : 'undone'}`}>
                {props.statusLabel(props.currentInterface.status)}
              </span>
            }
          />
          <InfoGridItem
            label="更新时间"
            value={props.formatUnixTime((props.currentInterface as unknown as Record<string, unknown>).up_time)}
          />
          {tags.length > 0 ? (
            <InfoGridItem
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
          <InfoGridItem
            label="接口路径"
            span
            value={
              <div className="interface-view-code-row flex flex-wrap items-center gap-2">
                <span className={`${props.methodClassName(props.method)} tag-method`}>{props.method}</span>
                <code className="interface-view-code">{props.fullPath}</code>
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
          <InfoGridItem
            label="Mock地址"
            span
            value={
              <div className="interface-view-code-row flex flex-wrap items-center gap-2">
                {mockFlag ? <Text c="dimmed">{mockFlag}</Text> : null}
                {props.mockUrl ? (
                  <a href={props.mockUrl} target="_blank" rel="noopener noreferrer" className="interface-view-link-button">
                    {props.mockUrl}
                  </a>
                ) : (
                  <span className="interface-view-link">-</span>
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
            <InfoGridItem
              label={props.customField.name || '自定义字段'}
              span
              value={String(props.currentInterface.custom_field_value || '')}
            />
          ) : null}
          <InfoGridItem
            label="规格导出"
            span
            value={
              <div className="interface-view-actions">
                <Button
                  size="compact-sm"
                  variant="default"
                  onClick={() => props.onCopySwaggerJson(interfaceId)}
                  loading={props.copyingSpec}
                  disabled={interfaceId <= 0}
                >
                  复制 Swagger JSON
                </Button>
                <Button
                  size="compact-sm"
                  variant="default"
                  onClick={() => props.onCopyOpenApiJson(interfaceId)}
                  loading={props.copyingSpec}
                  disabled={interfaceId <= 0}
                >
                  复制 OpenAPI 3.0
                </Button>
              </div>
            }
          />
        </InfoGrid>
      </SectionCard>

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
              <h3 className="interface-view-subtitle text-base font-semibold text-slate-900">
                Body({props.currentInterface.req_body_type || 'raw'})
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
