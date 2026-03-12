import { Badge, Button, Group, Text } from '@mantine/core';
import type { InterfaceDTO } from '../../types/interface-dto';

type InterfaceDetailHeaderProps = {
  currentInterface: InterfaceDTO;
  method: string;
  fullPath: string;
  mockUrl: string;
  methodClassName: (method?: string) => string;
  statusLabel: (status?: string) => string;
  formatUnixTime: (value: unknown) => string;
  onCopyText: (text: string, successText: string) => void;
  onCopySwaggerJson: (interfaceId: number) => void;
  onCopyOpenApiJson: (interfaceId: number) => void;
  onCopyMarkdown: (interfaceId: number) => void;
  copyingSpec: boolean;
  copyingMarkdown: boolean;
};

export function InterfaceDetailHeader(props: InterfaceDetailHeaderProps) {
  const updatedAt = props.formatUnixTime(props.currentInterface.up_time);
  const statusText = props.statusLabel(String(props.currentInterface.status || 'undone'));
  const tagCount = Array.isArray((props.currentInterface as unknown as Record<string, unknown>).tag)
    ? ((props.currentInterface as unknown as Record<string, unknown>).tag as unknown[]).length
    : 0;
  const interfaceId = Number(props.currentInterface._id || 0);
  const interfaceTitle = String(props.currentInterface.title || props.currentInterface.path || '未命名接口');

  return (
    <section className="interface-detail-header">
      <div className="interface-detail-header-copy">
        <Group gap={8}>
          <span className={props.methodClassName(props.method)}>{props.method}</span>
          <Badge color={props.currentInterface.status === 'done' ? 'green' : 'gray'} radius="xl">
            {statusText}
          </Badge>
          <Badge variant="light" radius="xl">{`更新于 ${updatedAt}`}</Badge>
          {tagCount > 0 ? (
            <Badge color="blue" variant="light" radius="xl">
              {`${tagCount} 个标签`}
            </Badge>
          ) : null}
        </Group>
        <div className="space-y-2">
          <h2 className="interface-detail-header-title">{interfaceTitle}</h2>
          <Text className="interface-detail-header-path">{props.fullPath}</Text>
          <Text size="sm" c="dimmed" className="max-w-3xl">
            先确认文档内容，再进入编辑或调试模式。导出规格和 Mock 地址也统一在这里处理。
          </Text>
        </div>
      </div>
      <div className="interface-detail-header-actions">
        <Button size="compact-sm" variant="default" onClick={() => props.onCopyText(props.fullPath, '接口路径已复制')}>
          复制路径
        </Button>
        <Button
          size="compact-sm"
          onClick={() => props.onCopyText(props.mockUrl, 'Mock 地址已复制')}
          disabled={!props.mockUrl}
        >
          复制 Mock URL
        </Button>
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
        <Button
          size="compact-sm"
          variant="default"
          onClick={() => props.onCopyMarkdown(interfaceId)}
          loading={props.copyingMarkdown}
          disabled={interfaceId <= 0}
        >
          复制接口 Markdown
        </Button>
      </div>
    </section>
  );
}
