import type { ReactNode } from 'react';
import { Button, Loader, Stack, Text, Title } from '@mantine/core';

type AsyncStateProps = {
  state: 'loading' | 'error' | 'empty';
  title?: string;
  description?: string;
  action?: ReactNode;
};

const defaultCopy: Record<AsyncStateProps['state'], { title: string; description: string }> = {
  loading: {
    title: '正在加载',
    description: '请稍候，内容正在准备中。'
  },
  error: {
    title: '加载失败',
    description: '当前内容暂时不可用，请稍后重试。'
  },
  empty: {
    title: '暂无内容',
    description: '当前还没有可显示的数据。'
  }
};

export function AsyncState(props: AsyncStateProps) {
  const copy = defaultCopy[props.state];
  const title = props.title || copy.title;
  const description = props.description || copy.description;

  return (
    <div className="rounded-[var(--radius-xl)] border border-slate-200 bg-white/94 px-6 py-12 text-center shadow-sm dark:!border-[#24456f] dark:!bg-[#0d2345]">
      <Stack align="center" gap="sm">
        {props.state === 'loading' ? <Loader size="lg" /> : null}
        <Title order={4}>{title}</Title>
        <Text c="dimmed" className="max-w-xl leading-7">
          {description}
        </Text>
        {props.action ? props.action : null}
      </Stack>
    </div>
  );
}

export function AsyncRetryAction(props: { onRetry: () => void; label?: string }) {
  return <Button onClick={props.onRetry}>{props.label || '重试'}</Button>;
}
