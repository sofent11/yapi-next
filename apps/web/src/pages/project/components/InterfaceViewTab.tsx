import { Avatar, Button, Col, Input, Row, Table, Tag, Tooltip, Typography } from 'antd';
import type { CSSProperties } from 'react';
import { CopyOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import type { LegacyInterfaceDTO } from '@yapi-next/shared-types';
import { sanitizeHtml } from '../../../utils/html-sanitize';

const { Text } = Typography;

type InterfaceViewTabProps = {
  currentInterface: LegacyInterfaceDTO & Record<string, unknown>;
  method: string;
  fullPath: string;
  mockUrl: string;
  projectIsMockOpen?: boolean;
  projectStrict?: boolean;
  customField?: { name?: string; enable?: boolean };
  reqParamsRows: Array<Record<string, unknown>>;
  reqHeadersRows: Array<Record<string, unknown>>;
  reqQueryRows: Array<Record<string, unknown>>;
  reqBodyFormRows: Array<Record<string, unknown>>;
  schemaRowsRequest: Array<Record<string, unknown>>;
  schemaRowsResponse: Array<Record<string, unknown>>;
  paramColumns: any[];
  bodyParamColumns: any[];
  schemaColumns: any[];
  methodStyle: (method?: string) => CSSProperties;
  statusLabel: (status?: string) => string;
  formatUnixTime: (value: unknown) => string;
  mockFlagText: (mockOpen?: boolean, strict?: boolean) => string;
  onCopyText: (text: string, successText: string) => void;
};

export function InterfaceViewTab(props: InterfaceViewTabProps) {
  const uid = Number((props.currentInterface as Record<string, unknown>).uid || 0);
  return (
    <div className="caseContainer">
      <h2 className="interface-title">基本信息</h2>
      <div className="panel-view">
        <Row className="row">
          <Col span={4} className="colKey">
            接口名称：
          </Col>
          <Col span={8} className="colName">
            <span title={String(props.currentInterface.title || '-')}>{props.currentInterface.title || '-'}</span>
          </Col>
          <Col span={4} className="colKey">
            创 建 人：
          </Col>
          <Col span={8} className="colValue">
            {uid > 0 ? (
              <Link className="user-name" to={`/user/profile/${uid}`}>
                <Avatar className="user-img" size={24} src={`/api/user/avatar?uid=${uid}`} />
                {String((props.currentInterface as Record<string, unknown>).username || '-')}
              </Link>
            ) : (
              String((props.currentInterface as Record<string, unknown>).username || '-')
            )}
          </Col>
        </Row>
        <Row className="row">
          <Col span={4} className="colKey">
            状 态：
          </Col>
          <Col span={8}>
            <span className={`legacy-status-tag ${props.currentInterface.status === 'done' ? 'done' : 'undone'}`}>
              {props.statusLabel(props.currentInterface.status)}
            </span>
          </Col>
          <Col span={4} className="colKey">
            更新时间：
          </Col>
          <Col span={8}>{props.formatUnixTime((props.currentInterface as Record<string, unknown>).up_time)}</Col>
        </Row>
        {(props.currentInterface.tag || []).length > 0 ? (
          <Row className="row remark">
            <Col span={4} className="colKey">
              Tag：
            </Col>
            <Col span={18} className="colValue">
              {(props.currentInterface.tag || []).map(tag => (
                <Tag key={tag}>{tag}</Tag>
              ))}
            </Col>
          </Row>
        ) : null}
        <Row className="row">
          <Col span={4} className="colKey">
            接口路径：
          </Col>
          <Col span={18} className="colValue colMethod">
            <span className="legacy-method-pill tag-method" style={props.methodStyle(props.method)}>
              {props.method}
            </span>
            <span>{props.fullPath}</span>
            <Tooltip title="复制路径">
              <Button
                size="small"
                type="text"
                icon={<CopyOutlined />}
                onClick={() => props.onCopyText(props.fullPath, '接口路径已复制')}
              />
            </Tooltip>
          </Col>
        </Row>
        <Row className="row">
          <Col span={4} className="colKey">
            Mock地址：
          </Col>
          <Col span={18} className="colValue">
            {props.mockFlagText(props.projectIsMockOpen, props.projectStrict) ? (
              <Text type="secondary">{props.mockFlagText(props.projectIsMockOpen, props.projectStrict)} </Text>
            ) : null}
            {props.mockUrl ? (
              <button
                type="button"
                className="legacy-view-link-btn"
                onClick={() => window.open(props.mockUrl, '_blank', 'noopener,noreferrer')}
              >
                {props.mockUrl}
              </button>
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
          </Col>
        </Row>
        {props.customField?.enable && String(props.currentInterface.custom_field_value || '').trim() ? (
          <Row className="row remark">
            <Col span={4} className="colKey">
              {props.customField.name || '自定义字段'}：
            </Col>
            <Col span={18} className="colValue">
              {String(props.currentInterface.custom_field_value || '')}
            </Col>
          </Row>
        ) : null}
      </div>

      {props.currentInterface.desc ? (
        <>
          <h2 className="interface-title">备注</h2>
          <div
            className="legacy-view-remark"
            dangerouslySetInnerHTML={{
              __html: sanitizeHtml(String(props.currentInterface.desc || ''))
            }}
          />
        </>
      ) : null}

      {(props.reqParamsRows.length > 0 ||
        props.reqHeadersRows.length > 0 ||
        props.reqQueryRows.length > 0 ||
        props.reqBodyFormRows.length > 0 ||
        props.currentInterface.req_body_other) ? (
        <>
          <h2 className="interface-title">请求参数</h2>
          {props.reqParamsRows.length > 0 ? (
            <div className="legacy-view-block">
              <h3 className="legacy-view-subtitle">路径参数</h3>
              <Table bordered size="small" rowKey="key" pagination={false} columns={props.paramColumns} dataSource={props.reqParamsRows} />
            </div>
          ) : null}
          {props.reqHeadersRows.length > 0 ? (
            <div className="legacy-view-block">
              <h3 className="legacy-view-subtitle">Headers</h3>
              <Table bordered size="small" rowKey="key" pagination={false} columns={props.paramColumns} dataSource={props.reqHeadersRows} />
            </div>
          ) : null}
          {props.reqQueryRows.length > 0 ? (
            <div className="legacy-view-block">
              <h3 className="legacy-view-subtitle">Query</h3>
              <Table bordered size="small" rowKey="key" pagination={false} columns={props.paramColumns} dataSource={props.reqQueryRows} />
            </div>
          ) : null}
          {props.reqBodyFormRows.length > 0 ? (
            <div className="legacy-view-block">
              <h3 className="legacy-view-subtitle">Body(form)</h3>
              <Table
                bordered
                size="small"
                rowKey="key"
                pagination={false}
                columns={props.bodyParamColumns}
                dataSource={props.reqBodyFormRows}
              />
            </div>
          ) : null}
          {props.currentInterface.req_body_other ? (
            <div className="legacy-view-block">
              <h3 className="legacy-view-subtitle">Body({props.currentInterface.req_body_type || 'raw'})</h3>
              {props.schemaRowsRequest.length > 0 ? (
                <Table
                  bordered
                  size="small"
                  rowKey="key"
                  pagination={false}
                  columns={props.schemaColumns}
                  dataSource={props.schemaRowsRequest}
                />
              ) : (
                <Input.TextArea rows={8} value={String(props.currentInterface.req_body_other || '')} readOnly />
              )}
            </div>
          ) : null}
        </>
      ) : null}

      {props.currentInterface.res_body ? (
        <>
          <h2 className="interface-title">返回数据</h2>
          <div className="legacy-view-block">
            {props.schemaRowsResponse.length > 0 ? (
              <Table
                bordered
                size="small"
                rowKey="key"
                pagination={false}
                columns={props.schemaColumns}
                dataSource={props.schemaRowsResponse}
              />
            ) : (
              <Input.TextArea rows={12} value={String(props.currentInterface.res_body || '')} readOnly />
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
