import type { ReactNode } from 'react';
import { Space, Typography } from 'antd';

const { Title, Paragraph } = Typography;

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};

export function PageHeader(props: PageHeaderProps) {
  return (
    <div className="legacy-page-header">
      <Space direction="vertical" size={4} className="legacy-page-header-main">
        <Title level={3} className="legacy-page-header-title">
          {props.title}
        </Title>
        {props.subtitle ? (
          <Paragraph type="secondary" className="legacy-page-header-subtitle">
            {props.subtitle}
          </Paragraph>
        ) : null}
      </Space>
      {props.actions ? <div className="legacy-page-header-actions">{props.actions}</div> : null}
    </div>
  );
}
