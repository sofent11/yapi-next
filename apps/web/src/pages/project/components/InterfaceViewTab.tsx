import { Avatar, Button, Descriptions, Input, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { DescriptionsProps, TableProps } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import type { LegacyInterfaceDTO } from '@yapi-next/shared-types';
import { SectionCard } from '../../../components/layout/SectionCard';
import { sanitizeHtml } from '../../../utils/html-sanitize';

const { Text } = Typography;
type ParamRow = Record<string, unknown>;
type ParamColumns = NonNullable<TableProps<ParamRow>['columns']>;

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

function renderParamTable(title: string, columns: ParamColumns, rows: ParamRow[]) {
  return (
    <div className="legacy-view-block">
      <h3 className="legacy-view-subtitle">{title}</h3>
      <Table
        bordered
        size="middle"
        rowKey={(_, index) => `${title}-${index ?? 0}`}
        pagination={false}
        columns={columns}
        dataSource={rows}
      />
    </div>
  );
}

export function InterfaceViewTab(props: InterfaceViewTabProps) {
  const uid = Number((props.currentInterface as Record<string, unknown>).uid || 0);
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
    <div className="caseContainer">
      <SectionCard title="基本信息" className="panel-view legacy-view-panel">
        <Descriptions
          size="small"
          column={{ xs: 1, md: 2 }}
          colon={false}
          className="legacy-view-descriptions"
          items={[
            {
              key: 'name',
              label: '接口名称',
              children: (
                <span className="legacy-view-name" title={String(props.currentInterface.title || '-')}>
                  {props.currentInterface.title || '-'}
                </span>
              )
            },
            {
              key: 'creator',
              label: '创建人',
              children:
                uid > 0 ? (
                  <Link className="user-name" to={`/user/profile/${uid}`}>
                    <Avatar className="user-img" size={28} src={`/api/user/avatar?uid=${uid}`} />
                    {String((props.currentInterface as Record<string, unknown>).username || '-')}
                  </Link>
                ) : (
                  String((props.currentInterface as Record<string, unknown>).username || '-')
                )
            },
            {
              key: 'status',
              label: '状态',
              children: (
                <span className={`legacy-status-tag ${props.currentInterface.status === 'done' ? 'done' : 'undone'}`}>
                  {props.statusLabel(props.currentInterface.status)}
                </span>
              )
            },
            {
              key: 'updated',
              label: '更新时间',
              children: props.formatUnixTime((props.currentInterface as Record<string, unknown>).up_time)
            },
            tags.length > 0
              ? {
                key: 'tags',
                label: 'Tag',
                span: 2,
                children: (
                  <Space wrap size={[6, 6]}>
                    {tags.map(tag => (
                      <Tag key={tag}>{tag}</Tag>
                    ))}
                  </Space>
                )
              }
              : undefined,
            {
              key: 'path',
              label: '接口路径',
              span: 2,
              children: (
                <Space wrap className="legacy-view-code-row">
                  <span className={`${props.methodClassName(props.method)} tag-method`}>
                    {props.method}
                  </span>
                  <code className="legacy-view-code">{props.fullPath}</code>
                  <Tooltip title="复制路径">
                    <Button
                      size="small"
                      type="text"
                      icon={<CopyOutlined />}
                      onClick={() => props.onCopyText(props.fullPath, '接口路径已复制')}
                    />
                  </Tooltip>
                </Space>
              )
            },
            {
              key: 'mock',
              label: 'Mock地址',
              span: 2,
              children: (
                <Space wrap className="legacy-view-code-row">
                  {mockFlag ? <Text type="secondary">{mockFlag}</Text> : null}
                  {props.mockUrl ? (
                    <a
                      href={props.mockUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="legacy-view-link-btn"
                    >
                      {props.mockUrl}
                    </a>
                  ) : (
                    <span className="legacy-view-link">-</span>
                  )}
                  {props.mockUrl ? (
                    <Tooltip title="复制Mock地址">
                      <Button
                        size="small"
                        type="text"
                        icon={<CopyOutlined />}
                        onClick={() => props.onCopyText(props.mockUrl, 'Mock地址已复制')}
                      />
                    </Tooltip>
                  ) : null}
                </Space>
              )
            },
            props.customField?.enable && String(props.currentInterface.custom_field_value || '').trim()
              ? {
                key: 'custom-field',
                label: props.customField.name || '自定义字段',
                span: 2,
                children: String(props.currentInterface.custom_field_value || '')
              }
              : undefined
          ].filter(Boolean) as NonNullable<DescriptionsProps['items']>}
        />
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
          {props.reqParamsRows.length > 0
            ? renderParamTable('路径参数', props.paramColumns, props.reqParamsRows)
            : null}
          {props.reqHeadersRows.length > 0
            ? renderParamTable('Headers', props.paramColumns, props.reqHeadersRows)
            : null}
          {props.reqQueryRows.length > 0
            ? renderParamTable('Query', props.paramColumns, props.reqQueryRows)
            : null}
          {props.reqBodyFormRows.length > 0
            ? renderParamTable('Body(form)', props.bodyParamColumns, props.reqBodyFormRows)
            : null}
          {props.currentInterface.req_body_other ? (
            <div className="legacy-view-block">
              <h3 className="legacy-view-subtitle">Body({props.currentInterface.req_body_type || 'raw'})</h3>
              {props.schemaRowsRequest.length > 0 ? (
                <Table
                  bordered
                  size="middle"
                  rowKey={(_, index) => `schema-req-${index ?? 0}`}
                  pagination={false}
                  columns={props.schemaColumns}
                  dataSource={props.schemaRowsRequest}
                />
              ) : (
                <div className="legacy-view-raw-block">
                  <div className="legacy-run-section-head">
                    <Text strong>原始 Body</Text>
                    <Tooltip title="复制 Body 内容">
                      <Button
                        size="small"
                        type="text"
                        icon={<CopyOutlined />}
                        onClick={() => props.onCopyText(String(props.currentInterface.req_body_other || ''), 'Body 内容已复制')}
                      />
                    </Tooltip>
                  </div>
                  <Input.TextArea rows={8} value={String(props.currentInterface.req_body_other || '')} readOnly />
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
              <Table
                bordered
                size="middle"
                rowKey={(_, index) => `schema-res-${index ?? 0}`}
                pagination={false}
                columns={props.schemaColumns}
                dataSource={props.schemaRowsResponse}
              />
            ) : (
              <div className="legacy-view-raw-block">
                <div className="legacy-run-section-head">
                  <Text strong>原始响应</Text>
                  <Tooltip title="复制返回数据">
                    <Button
                      size="small"
                      type="text"
                      icon={<CopyOutlined />}
                      onClick={() => props.onCopyText(String(props.currentInterface.res_body || ''), '返回数据已复制')}
                    />
                  </Tooltip>
                </div>
                <Input.TextArea rows={12} value={String(props.currentInterface.res_body || '')} readOnly />
              </div>
            )}
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
