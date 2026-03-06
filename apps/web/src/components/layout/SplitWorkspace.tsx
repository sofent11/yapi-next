import type { CSSProperties, ReactNode } from 'react';

type SplitWorkspaceProps = {
  left: ReactNode;
  right: ReactNode;
  leftWidth?: number;
  gap?: number;
  className?: string;
  leftHidden?: boolean;
};

export function SplitWorkspace(props: SplitWorkspaceProps) {
  const leftWidth = props.leftWidth ?? 320;
  const gap = props.gap ?? 16;
  const className = [
    'legacy-split-workspace',
    props.leftHidden ? 'legacy-split-workspace-left-hidden' : '',
    props.className
  ]
    .filter(Boolean)
    .join(' ');
  const style = {
    '--legacy-split-left-width': `${leftWidth}px`,
    '--legacy-split-gap': `${gap}px`
  } as CSSProperties;

  return (
    <div className={className} style={style}>
      <div className="legacy-split-workspace-left" aria-hidden={props.leftHidden ? 'true' : undefined}>
        {props.left}
      </div>
      <div className="legacy-split-workspace-right">{props.right}</div>
    </div>
  );
}
