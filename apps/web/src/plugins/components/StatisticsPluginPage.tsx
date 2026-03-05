import { safeExecute, normalizePath, parseJsonSafe, parseMaybeJson, isValidRouteContract, toObject, inferPrimitiveSchema, mergeInferredSchemas, inferSchemaFromSample, inferDraft4SchemaTextFromJsonText, toStringValue, postJson, getJson, DRAFT4_SCHEMA_URI } from '../index';
import type { LegacyRouteContract } from '../../types/legacy-contract';
import type { HeaderMenuItem, SubNavItem, SubSettingNavItem, InterfaceTabItem, ImportDataItem, ExportDataItem, RequestLifecycleMeta } from '../index';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Descriptions, Form, Input, InputNumber, Modal, Popconfirm, Radio, Select, Space, Spin, Switch, Table, Tabs, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import json5 from 'json5';

const { Text, Paragraph } = Typography;

// Extracted from index.tsx
type StatisticsCount = {
  groupCount: number;
  projectCount: number;
  interfaceCount: number;
  interfaceCaseCount: number;
};

type StatisticsSystemStatus = {
  mail?: string;
  systemName?: string;
  totalmem?: string;
  freemem?: string;
  uptime?: string;
  load?: string;
};

type StatisticsMockData = {
  mockCount?: number;
  mockDateList?: Array<{ _id?: string; count?: number }>;
};

type StatisticsGroupRow = {
  name?: string;
  interface?: number;
  mock?: number;
  project?: number;
};

export function StatisticsPluginPage() {
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState<StatisticsCount | null>(null);
  const [systemStatus, setSystemStatus] = useState<StatisticsSystemStatus | null>(null);
  const [mockData, setMockData] = useState<StatisticsMockData | null>(null);
  const [groupRows, setGroupRows] = useState<StatisticsGroupRow[]>([]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const [countRes, systemRes, mockRes, groupRes] = await Promise.all([
          getJson<StatisticsCount>('/api/plugin/statismock/count'),
          getJson<StatisticsSystemStatus>('/api/plugin/statismock/get_system_status'),
          getJson<StatisticsMockData>('/api/plugin/statismock/get'),
          getJson<StatisticsGroupRow[]>('/api/plugin/statismock/group_data_statis')
        ]);
        if (!active) return;
        if (countRes.errcode === 0) setCount(countRes.data || null);
        if (systemRes.errcode === 0) setSystemStatus(systemRes.data || null);
        if (mockRes.errcode === 0) setMockData(mockRes.data || null);
        if (groupRes.errcode === 0) setGroupRows(groupRes.data || []);
      } catch (error) {
        if (!active) return;
        message.error(`系统信息加载失败: ${String((error as Error).message || error)}`);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  const columns = useMemo<ColumnsType<StatisticsGroupRow>>(
    () => [
      { title: '分组', dataIndex: 'name', key: 'name' },
      { title: '项目数', dataIndex: 'project', key: 'project', width: 120 },
      { title: '接口数', dataIndex: 'interface', key: 'interface', width: 120 },
      { title: 'Mock 调用', dataIndex: 'mock', key: 'mock', width: 140 }
    ],
    []
  );

  return (
    <Space direction="vertical" className="legacy-workspace-stack" size={16}>
      {loading ? (
        <Card>
          <Space>
            <Spin size="small" />
            <Text>加载统计数据...</Text>
          </Space>
        </Card>
      ) : null}
      <Card title="总览">
        <Space wrap size={24}>
          <Tag color="blue">分组 {count?.groupCount ?? 0}</Tag>
          <Tag color="green">项目 {count?.projectCount ?? 0}</Tag>
          <Tag color="purple">接口 {count?.interfaceCount ?? 0}</Tag>
          <Tag color="orange">测试用例 {count?.interfaceCaseCount ?? 0}</Tag>
          <Tag color="cyan">Mock 访问 {mockData?.mockCount ?? 0}</Tag>
        </Space>
      </Card>
      <Card title="系统状态">
        <Descriptions size="small" bordered column={2}>
          <Descriptions.Item label="系统">{systemStatus?.systemName || '-'}</Descriptions.Item>
          <Descriptions.Item label="邮件">{systemStatus?.mail || '-'}</Descriptions.Item>
          <Descriptions.Item label="CPU 负载">{systemStatus?.load || '-'}%</Descriptions.Item>
          <Descriptions.Item label="运行时间">{systemStatus?.uptime || '-'}</Descriptions.Item>
          <Descriptions.Item label="总内存">{systemStatus?.totalmem || '-'}</Descriptions.Item>
          <Descriptions.Item label="可用内存">{systemStatus?.freemem || '-'}</Descriptions.Item>
        </Descriptions>
      </Card>
      <Card title="分组统计">
        <Table
          rowKey={row => String(row.name || Math.random())}
          size="small"
          pagination={false}
          columns={columns}
          dataSource={groupRows}
        />
      </Card>
    </Space>
  );
}
