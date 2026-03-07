import type { DragEvent, KeyboardEvent, ReactNode } from 'react';

type ResourceLeafRowProps = {
  active?: boolean;
  leading: ReactNode;
  title: ReactNode;
  actions?: ReactNode;
  dragEnabled?: boolean;
  onNavigate: () => void;
  onKeyNavigate: (event: KeyboardEvent<HTMLElement>) => void;
  onDragStart?: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onDrop?: (event: DragEvent<HTMLDivElement>) => void;
};

export function ResourceLeafRow(props: ResourceLeafRowProps) {
  return (
    <div
      className={`interface-nav-item${props.active ? ' active' : ''}`}
      role="button"
      tabIndex={0}
      aria-current={props.active ? 'page' : undefined}
      draggable={props.dragEnabled}
      onDragStart={props.onDragStart}
      onDragEnd={props.onDragEnd}
      onDragOver={props.onDragOver}
      onDrop={props.onDrop}
      onClick={props.onNavigate}
      onKeyDown={props.onKeyNavigate}
    >
      {props.leading}
      {props.title}
      {props.actions}
    </div>
  );
}
