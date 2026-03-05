import { Alert, Button, Descriptions, Input, Modal, Space, Table, Tag, Typography } from 'antd';

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

type AutoTestResultModalsProps = {
  reportOpen: boolean;
  onCloseReport: () => void;
  detailItem: AutoTestResultItem | null;
  onCloseDetail: () => void;
  report: AutoTestReport | null;
  rows: AutoTestResultItem[];
  onOpenDetail: (item: AutoTestResultItem) => void;
  methodStyle: (method?: string) => { color: string; background: string };
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
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
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
              </Space>
            }
          />
          <Table<AutoTestResultItem>
            rowKey={row => String(row.id || `${row.method || 'GET'}:${row.path || ''}`)}
            size="small"
            pagination={{ pageSize: 10 }}
            dataSource={props.rows}
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
                    <span className="legacy-method-pill" style={props.methodStyle(row.method || 'GET')}>
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
                  <Button size="small" onClick={() => props.onOpenDetail(row)}>
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
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
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
            <Text strong>校验信息</Text>
            <Input.TextArea
              rows={5}
              readOnly
              value={(props.detailItem.validRes || []).map(item => item?.message || '').join('\n') || '-'}
            />
            <Text strong>请求参数</Text>
            <Input.TextArea rows={6} readOnly value={stringifyPretty(props.detailItem.params)} />
            <Text strong>响应头</Text>
            <Input.TextArea rows={6} readOnly value={stringifyPretty(props.detailItem.res_header)} />
            <Text strong>响应体</Text>
            <Input.TextArea rows={10} readOnly value={stringifyPretty(props.detailItem.res_body)} />
          </Space>
        ) : null}
      </Modal>
    </>
  );
}
