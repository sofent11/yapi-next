import { Button, Group } from '@mantine/core';

type GuideActionsProps = {
  isLast?: boolean;
  onNext: () => void;
  onExit: () => void;
};

export function GuideActions(props: GuideActionsProps) {
  return (
    <Group gap={8} wrap="nowrap">
      <Button size="xs" radius="xl" onClick={props.onNext}>
        {props.isLast ? '完成' : '下一步'}
      </Button>
      <Button size="xs" radius="xl" variant="light" color="gray" onClick={props.onExit}>
        退出指引
      </Button>
    </Group>
  );
}
