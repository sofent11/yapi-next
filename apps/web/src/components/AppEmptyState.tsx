import { Button, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconMoodEmpty, IconMoodSad } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';

type AppEmptyStateType =
  | 'noFollow'
  | 'noInterface'
  | 'noMemberInProject'
  | 'noMemberInGroup'
  | 'noProject'
  | 'noData'
  | 'noChange';

type AppEmptyStateProps = {
  type?: AppEmptyStateType;
  title?: string;
  desc?: string;
};

function resolveContent(type?: AppEmptyStateType): { title: string; desc: string; icon: 'frown' | 'meh' } {
  switch (type) {
    case 'noFollow':
      return {
        title: '你还没有关注项目呢',
        desc: '先去“项目广场”逛逛吧，那里可以添加关注。',
        icon: 'frown'
      };
    case 'noInterface':
      return {
        title: '该项目还没有接口呢',
        desc: '在左侧“接口列表”中添加接口。',
        icon: 'frown'
      };
    case 'noMemberInProject':
      return {
        title: '该项目还没有成员呢',
        desc: '点击右上角“添加成员”开始协作。',
        icon: 'frown'
      };
    case 'noMemberInGroup':
      return {
        title: '该分组还没有成员呢',
        desc: '先添加成员，再进行权限管理。',
        icon: 'frown'
      };
    case 'noProject':
      return {
        title: '该分组还没有项目呢',
        desc: '请点击右上角“添加项目”按钮新建项目。',
        icon: 'frown'
      };
    case 'noChange':
      return {
        title: '没有改动',
        desc: '该操作未改动 API 数据。',
        icon: 'meh'
      };
    case 'noData':
    default:
      return {
        title: '暂无数据',
        desc: '先去别处逛逛吧。',
        icon: 'frown'
      };
  }
}

export function AppEmptyState(props: AppEmptyStateProps) {
  const navigate = useNavigate();
  const fallback = resolveContent(props.type);
  const title = props.title || fallback.title;
  const desc = props.desc || fallback.desc;

  return (
    <Stack
      align="center"
      gap="sm"
      className="rounded-[var(--radius-xl)] border border-dashed border-[var(--border-shell-strong)] bg-[var(--surface-shell-subtle)] px-6 py-10 text-center text-[var(--text-primary)]"
    >
      <ThemeIcon size={56} radius="xl" variant="light" color="gray">
        {fallback.icon === 'meh' ? <IconMoodEmpty size={28} /> : <IconMoodSad size={28} />}
      </ThemeIcon>
      <Title order={4} className="text-[var(--text-primary)]">
        {title}
      </Title>
      <Text className="max-w-lg leading-7 text-[var(--text-secondary)]">
        {desc}
      </Text>
      {props.type === 'noFollow' ? (
        <Button variant="subtle" onClick={() => navigate('/group')}>
          去项目广场
        </Button>
      ) : null}
    </Stack>
  );
}
