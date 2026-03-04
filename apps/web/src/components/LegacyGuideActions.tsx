import { Button, Space } from 'antd';

type LegacyGuideActionsProps = {
  isLast?: boolean;
  onNext: () => void;
  onExit: () => void;
};

export function LegacyGuideActions(props: LegacyGuideActionsProps) {
  return (
    <Space className="legacy-guide-actions" size={8}>
      <Button size="small" type="primary" onClick={props.onNext}>
        {props.isLast ? '完成' : '下一步'}
      </Button>
      <Button size="small" onClick={props.onExit}>
        退出指引
      </Button>
    </Space>
  );
}

