import { useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, Group, Stack, Table, Text, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCopy, IconFileDescription, IconSparkles } from '@tabler/icons-react';
import { useGenerateProjectApiMarkdownMutation } from '../../services/yapi-api';
import { safeApiRequest } from '../../utils/safe-request';

type ProjectApiMarkdownPageProps = {
  projectId: number;
};

type GenerateResult = {
  projectId: number;
  projectName: string;
  basepath: string;
  totalInputs: number;
  matchedCount: number;
  ignoredCount: number;
  matched: Array<{
    id: number;
    title: string;
    method: string;
    path: string;
    fullPath: string;
    catName: string;
  }>;
  ignored: Array<{
    input: string;
    reason: string;
    interfaceId?: number;
    inputProjectId?: number;
  }>;
  markdown: string;
};

const message = {
  success(text: string) {
    notifications.show({ color: 'teal', message: text });
  },
  error(text: string) {
    notifications.show({ color: 'red', message: text });
  }
};

export function ProjectApiMarkdownPage(props: ProjectApiMarkdownPageProps) {
  const [source, setSource] = useState('');
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [generateApiMarkdown, generateState] = useGenerateProjectApiMarkdownMutation();

  const placeholder = useMemo(
    () =>
      [
        `https://decom.valleysound.xyz/yapi/project/${props.projectId}/interface/api/20049`,
        `https://decom.valleysound.xyz/yapi/project/${props.projectId}/interface/api/19898`,
        `https://decom.valleysound.xyz/yapi/project/${props.projectId}/interface/api/19919`
      ].join('\n'),
    [props.projectId]
  );

  async function handleGenerate() {
    if (!source.trim()) {
      message.error('请输入接口 URL');
      return;
    }

    const response = await safeApiRequest(
      generateApiMarkdown({
        project_id: props.projectId,
        source
      }).unwrap(),
      {
        fallback: '生成接口 Markdown 失败',
        onError: text => message.error(text)
      }
    );
    if (!response) return;

    setResult(response.data as GenerateResult);
    message.success('接口 Markdown 已生成');
  }

  async function handleCopy() {
    if (!result?.markdown) {
      message.error('当前没有可复制的 Markdown');
      return;
    }
    try {
      await navigator.clipboard.writeText(result.markdown);
      message.success('Markdown 已复制');
    } catch (_err) {
      message.error('复制失败，请手动复制');
    }
  }

  return (
    <div className="page-shell project-data-page">
      <Stack className="workspace-stack">
        <Alert
          color="blue"
          title="批量输入接口 URL，自动过滤当前项目并生成 Markdown。"
          icon={<IconSparkles size={16} />}
        >
          支持一行一个 URL，也支持直接输入接口 ID。重复链接会自动去重，非当前项目或无效输入会在结果区列出。
        </Alert>

        <Card padding="lg" radius="lg" withBorder className="project-data-card">
          <Stack className="workspace-stack">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <Text fw={700} size="lg">接口 Markdown 生成</Text>
                <Text className="workspace-paragraph">
                  将当前项目中的接口详情整理为可复制的 Markdown 文档。
                </Text>
              </div>
              <Group gap="xs">
                <Button
                  variant="default"
                  onClick={() => {
                    setSource('');
                    setResult(null);
                  }}
                >
                  清空
                </Button>
                <Button
                  leftSection={<IconFileDescription size={16} />}
                  loading={generateState.isLoading}
                  onClick={() => void handleGenerate()}
                >
                  生成 Markdown
                </Button>
              </Group>
            </div>

            <Textarea
              minRows={12}
              autosize
              value={source}
              onChange={event => setSource(event.currentTarget.value)}
              placeholder={placeholder}
            />
          </Stack>
        </Card>

        {result ? (
          <Card padding="lg" radius="lg" withBorder className="project-data-card">
            <Stack className="workspace-stack">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <Text fw={700}>生成结果</Text>
                  <Text className="workspace-paragraph">
                    项目：{result.projectName || `项目 ${result.projectId}`}，BasePath：{result.basepath || '/'}
                  </Text>
                </div>
                <Group gap="xs">
                  <Badge color="blue" variant="light">输入 {result.totalInputs}</Badge>
                  <Badge color="teal" variant="light">命中 {result.matchedCount}</Badge>
                  <Badge color={result.ignoredCount > 0 ? 'yellow' : 'gray'} variant="light">
                    忽略 {result.ignoredCount}
                  </Badge>
                </Group>
              </div>

              {result.matched.length > 0 ? (
                <Table withTableBorder striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>接口</Table.Th>
                      <Table.Th>分类</Table.Th>
                      <Table.Th>路径</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {result.matched.map(item => (
                      <Table.Tr key={item.id}>
                        <Table.Td>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge size="sm" variant="light">{item.method}</Badge>
                            <span>{item.title}</span>
                            <span className="text-xs text-slate-400">#{item.id}</span>
                          </div>
                        </Table.Td>
                        <Table.Td>{item.catName}</Table.Td>
                        <Table.Td>
                          <div className="space-y-1">
                            <div>{item.path}</div>
                            <div className="text-xs text-slate-400">{item.fullPath}</div>
                          </div>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              ) : (
                <Text className="workspace-paragraph">当前没有命中接口，请检查输入链接是否属于本项目。</Text>
              )}

              {result.ignored.length > 0 ? (
                <div className="space-y-3">
                  <Text fw={600}>忽略项</Text>
                  <div className="space-y-2">
                    {result.ignored.map((item, index) => (
                      <div
                        key={`${item.input}-${index}`}
                        className="rounded-[var(--radius-md)] border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-[var(--border-project-subtle)] dark:bg-[var(--surface-project-input)]"
                      >
                        <div className="font-medium text-slate-700 dark:text-slate-200">{item.input}</div>
                        <div className="mt-1 text-slate-500 dark:text-slate-400">{item.reason}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </Stack>
          </Card>
        ) : null}

        <Card padding="lg" radius="lg" withBorder className="project-data-card">
          <Stack className="workspace-stack">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <Text fw={700}>Markdown 文本</Text>
                <Text className="workspace-paragraph">
                  生成后可直接复制到文档、飞书或 README 中。
                </Text>
              </div>
              <Button
                variant="light"
                leftSection={<IconCopy size={16} />}
                onClick={() => void handleCopy()}
                disabled={!result?.markdown}
              >
                一键复制 Markdown
              </Button>
            </div>

            <pre className="plugin-pre">{result?.markdown || '生成结果会显示在这里。'}</pre>
          </Stack>
        </Card>
      </Stack>
    </div>
  );
}
