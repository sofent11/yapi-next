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
    'grid min-w-0 items-start',
    props.className
  ]
    .filter(Boolean)
    .join(' ');
  const style = props.leftHidden
    ? {
        gap: `${gap}px`,
        gridTemplateColumns: 'minmax(0, 1fr)'
      }
    : {
        gap: `${gap}px`,
        gridTemplateColumns: `minmax(260px, ${leftWidth}px) minmax(0, 1fr)`
      } as CSSProperties;

  return (
    <div className={className} style={style}>
      {props.leftHidden ? null : (
        <div className="min-w-0" aria-hidden={props.leftHidden ? 'true' : undefined}>
          {props.left}
        </div>
      )}
      <div className="min-w-0">{props.right}</div>
    </div>
  );
}
