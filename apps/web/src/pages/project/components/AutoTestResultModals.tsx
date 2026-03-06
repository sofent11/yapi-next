import { Alert, Button, Descriptions, Input, Modal, Space, Table, Tag, Typography, message } from 'antd';
import { CopyOutlined } from '@ant-design/icons';

const { Text } = Typography;

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

function stringifyPretty(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch (_err) {
    return String(value ?? '');
  }
}

export function AutoTestResultModals(props: AutoTestResultModalsProps) {
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
      <Modal
        title="服务端测试结果"
        open={props.reportOpen}
        width={1080}
        footer={[
          <Button key="close" onClick={props.onCloseReport}>
            关闭
          </Button>
        ]}
        onCancel={props.onCloseReport}
      >
        <Space direction="vertical" className="legacy-report-modal-stack" size={12}>
          <Alert
            type="info"
            showIcon
            message={props.report?.message?.msg || '暂无测试结果'}
            description={
              <Space size={12} wrap>
                <span>总数: {Number(props.report?.message?.len || props.rows.length || 0)}</span>
                <span>通过: {Number(props.report?.message?.successNum || 0)}</span>
                <span>失败: {Number(props.report?.message?.failedNum || 0)}</span>
                <span>耗时: {String(props.report?.runTime || '-')}</span>
                <Button
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => void copyText(reportSummaryText, '报告摘要已复制')}
                >
                  复制摘要
                </Button>
              </Space>
            }
          />
          <Table<AutoTestResultItem>
            className="legacy-report-table"
            rowKey={row => String(row.id || `${row.method || 'GET'}:${row.path || ''}`)}
            size="small"
            pagination={{ pageSize: 10 }}
            dataSource={props.rows}
            rowClassName={row =>
              row.code === 0 ? 'legacy-report-row-pass' : row.code === 1 ? 'legacy-report-row-fail' : 'legacy-report-row-error'
            }
            onRow={row => ({
              onClick: () => props.onOpenDetail(row)
            })}
            locale={{ emptyText: '暂无可展示的测试结果' }}
            columns={[
              {
                title: '用例',
                width: 240,
                render: (_, row) => <span>{row.name || row.id}</span>
              },
              {
                title: '接口',
                render: (_, row) => (
                  <Space size={8}>
                    <span className={props.methodClassName(row.method || 'GET')}>
                      {String(row.method || 'GET').toUpperCase()}
                    </span>
                    <span>{row.path || '-'}</span>
                  </Space>
                )
              },
              {
                title: 'HTTP',
                width: 90,
                render: (_, row) => (row.status == null ? '-' : String(row.status))
              },
              {
                title: '结果',
                width: 90,
                render: (_, row) =>
                  row.code === 0 ? (
                    <Tag color="success">通过</Tag>
                  ) : (
                    <Tag color={row.code === 1 ? 'warning' : 'error'}>
                      {row.code === 1 ? '失败' : '异常'}
                    </Tag>
                  )
              },
              {
                title: '信息',
                render: (_, row) => (
                  <span>
                    {(row.validRes || [])
                      .map(item => String(item?.message || ''))
                      .filter(Boolean)
                      .join(' | ') || row.statusText || '-'}
                  </span>
                )
              },
              {
                title: '操作',
                width: 90,
                render: (_, row) => (
                  <Button
                    size="small"
                    onClick={event => {
                      event.stopPropagation();
                      props.onOpenDetail(row);
                    }}
                  >
                    详情
                  </Button>
                )
              }
            ]}
          />
        </Space>
      </Modal>

      <Modal
        title={`测试详情 ${props.detailItem?.name || ''}`}
        open={!!props.detailItem}
        width={980}
        onCancel={props.onCloseDetail}
        footer={[
          <Button key="close" onClick={props.onCloseDetail}>
            关闭
          </Button>
        ]}
      >
        {props.detailItem ? (
          <Space direction="vertical" className="legacy-report-detail-stack" size={12}>
            <div className="legacy-run-section-head">
              <Text strong>基础信息</Text>
              <Button
                size="small"
                icon={<CopyOutlined />}
                onClick={() => void copyText(stringifyPretty(props.detailItem), '测试详情已复制')}
              >
                复制全部
              </Button>
            </div>
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="用例ID">{props.detailItem.id || '-'}</Descriptions.Item>
              <Descriptions.Item label="接口地址">
                {props.detailItem.url || props.detailItem.path || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="方法">{String(props.detailItem.method || '-')}</Descriptions.Item>
              <Descriptions.Item label="HTTP 状态">
                {props.detailItem.status == null ? '-' : String(props.detailItem.status)}
              </Descriptions.Item>
              <Descriptions.Item label="执行结果">
                {props.detailItem.code === 0 ? '通过' : props.detailItem.code === 1 ? '失败' : '异常'}
              </Descriptions.Item>
            </Descriptions>
            <div className="legacy-run-section-head">
              <Text strong>校验信息</Text>
              <Button
                size="small"
                icon={<CopyOutlined />}
                onClick={() =>
                  void copyText(
                    (props.detailItem?.validRes || []).map(item => item?.message || '').join('\n') || '-',
                    '校验信息已复制'
                  )
                }
              >
                复制
              </Button>
            </div>
            <Input.TextArea
              rows={5}
              readOnly
              value={(props.detailItem.validRes || []).map(item => item?.message || '').join('\n') || '-'}
            />
            <div className="legacy-run-section-head">
              <Text strong>请求参数</Text>
              <Button
                size="small"
                icon={<CopyOutlined />}
                onClick={() => void copyText(stringifyPretty(props.detailItem?.params), '请求参数已复制')}
              >
                复制
              </Button>
            </div>
            <Input.TextArea rows={6} readOnly value={stringifyPretty(props.detailItem.params)} />
            <div className="legacy-run-section-head">
              <Text strong>响应头</Text>
              <Button
                size="small"
                icon={<CopyOutlined />}
                onClick={() => void copyText(stringifyPretty(props.detailItem?.res_header), '响应头已复制')}
              >
                复制
              </Button>
            </div>
            <Input.TextArea rows={6} readOnly value={stringifyPretty(props.detailItem.res_header)} />
            <div className="legacy-run-section-head">
              <Text strong>响应体</Text>
              <Button
                size="small"
                icon={<CopyOutlined />}
                onClick={() => void copyText(stringifyPretty(props.detailItem?.res_body), '响应体已复制')}
              >
                复制
              </Button>
            </div>
            <Input.TextArea rows={10} readOnly value={stringifyPretty(props.detailItem.res_body)} />
          </Space>
        ) : null}
      </Modal>
    </>
  );
}
