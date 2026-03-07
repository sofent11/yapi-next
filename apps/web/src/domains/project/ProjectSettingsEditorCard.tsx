import type { ReactNode } from 'react';
import { Card, Text } from '@mantine/core';

type ProjectSettingsEditorCardProps = {
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function ProjectSettingsEditorCard(props: ProjectSettingsEditorCardProps) {
  return (
    <Card withBorder radius="lg" className={['project-settings-editor-card', props.className].filter(Boolean).join(' ')}>
      <div className="project-settings-editor-card-head">
        <Text fw={600}>{props.title}</Text>
        {props.actions ? <div>{props.actions}</div> : null}
      </div>
      {props.children}
    </Card>
  );
}
