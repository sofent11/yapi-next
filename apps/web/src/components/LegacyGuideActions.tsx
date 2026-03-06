import { Button, Group } from '@mantine/core';

type LegacyGuideActionsProps = {
  isLast?: boolean;
  onNext: () => void;
  onExit: () => void;
};

export function LegacyGuideActions(props: LegacyGuideActionsProps) {
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
