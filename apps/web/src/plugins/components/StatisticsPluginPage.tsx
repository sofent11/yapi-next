import { useEffect, useState } from 'react';
import { Badge, Card, Loader, SimpleGrid, Stack, Table, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { getJson } from '../index';

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

const message = {
  error(text: string) {
    notifications.show({ color: 'red', message: text });
  }
};

function StatRow(props: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 px-4 py-3">
      <Text size="sm" c="dimmed">
        {props.label}
      </Text>
      <Text fw={600}>{props.value}</Text>
    </div>
  );
}

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

  return (
    <Stack className="workspace-stack" gap="md">
      {loading ? (
        <Card padding="lg" radius="lg" withBorder>
          <div className="inline-flex items-center gap-2">
            <Loader size="sm" />
            <Text>加载统计数据...</Text>
          </div>
        </Card>
      ) : null}
      <Card padding="lg" radius="lg" withBorder>
        <Text fw={600} mb="sm">
          总览
        </Text>
        <div className="flex flex-wrap gap-3">
          <Badge color="blue">分组 {count?.groupCount ?? 0}</Badge>
          <Badge color="green">项目 {count?.projectCount ?? 0}</Badge>
          <Badge color="violet">接口 {count?.interfaceCount ?? 0}</Badge>
          <Badge color="orange">测试用例 {count?.interfaceCaseCount ?? 0}</Badge>
          <Badge color="cyan">Mock 访问 {mockData?.mockCount ?? 0}</Badge>
        </div>
      </Card>
      <Card padding="lg" radius="lg" withBorder>
        <Text fw={600} mb="sm">
          系统状态
        </Text>
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
          <StatRow label="系统" value={systemStatus?.systemName || '-'} />
          <StatRow label="邮件" value={systemStatus?.mail || '-'} />
          <StatRow label="CPU 负载" value={`${systemStatus?.load || '-'}%`} />
          <StatRow label="运行时间" value={systemStatus?.uptime || '-'} />
          <StatRow label="总内存" value={systemStatus?.totalmem || '-'} />
          <StatRow label="可用内存" value={systemStatus?.freemem || '-'} />
        </SimpleGrid>
      </Card>
      <Card padding="lg" radius="lg" withBorder>
        <Text fw={600} mb="sm">
          分组统计
        </Text>
        <Table striped highlightOnHover withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>分组</Table.Th>
              <Table.Th>项目数</Table.Th>
              <Table.Th>接口数</Table.Th>
              <Table.Th>Mock 调用</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {groupRows.map((row, index) => (
              <Table.Tr key={`${row.name || 'group'}-${index}`}>
                <Table.Td>{row.name || '-'}</Table.Td>
                <Table.Td>{row.project ?? 0}</Table.Td>
                <Table.Td>{row.interface ?? 0}</Table.Td>
                <Table.Td>{row.mock ?? 0}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>
    </Stack>
  );
}
