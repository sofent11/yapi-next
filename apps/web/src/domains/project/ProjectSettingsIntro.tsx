import type { ReactNode } from 'react';
import { Alert } from '@mantine/core';

type ProjectSettingsIntroProps = {
  title: ReactNode;
  children?: ReactNode;
};

export function ProjectSettingsIntro(props: ProjectSettingsIntroProps) {
  return (
    <Alert color="blue" className="project-settings-info-alert" title={props.title}>
      {props.children}
    </Alert>
  );
}
