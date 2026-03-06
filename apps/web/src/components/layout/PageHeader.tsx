import type { ReactNode } from 'react';
import { Space, Typography } from 'antd';

const { Title, Paragraph } = Typography;

type PageHeaderProps = {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  meta?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
};

export function PageHeader(props: PageHeaderProps) {
  return (
    <header className="legacy-page-header">
      <div className="legacy-page-header-main">
        <Space direction="vertical" size={6} className="legacy-page-header-copy">
          {props.eyebrow ? (
            <span className="legacy-page-header-eyebrow">{props.eyebrow}</span>
          ) : null}
          <Title level={3} className="legacy-page-header-title">
            {props.title}
          </Title>
          {props.subtitle ? (
            <Paragraph type="secondary" className="legacy-page-header-subtitle">
              {props.subtitle}
            </Paragraph>
          ) : null}
          {props.meta || props.status ? (
            <div className="legacy-page-header-meta-wrap">
              {props.meta ? <div className="legacy-page-header-meta">{props.meta}</div> : null}
              {props.status ? <div className="legacy-page-header-status">{props.status}</div> : null}
            </div>
          ) : null}
        </Space>
      </div>
      {props.actions ? <div className="legacy-page-header-actions">{props.actions}</div> : null}
    </header>
  );
}
