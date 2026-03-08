import type { DragEvent, KeyboardEvent, ReactNode } from 'react';

type ResourceLeafRowProps = {
  active?: boolean;
  leading: ReactNode;
  title: ReactNode;
  actions?: ReactNode;
  dragEnabled?: boolean;
  onNavigate: () => void;
  onKeyNavigate: (event: KeyboardEvent<HTMLElement>) => void;
  onDragStart?: (event: DragEvent<HTMLElement>) => void;
  onDragEnd?: () => void;
  onDragOver?: (event: DragEvent<HTMLElement>) => void;
  onDrop?: (event: DragEvent<HTMLElement>) => void;
};

export function ResourceLeafRow(props: ResourceLeafRowProps) {
  return (
    <button
      type="button"
      className={`interface-nav-item${props.active ? ' active' : ''} w-full text-left`}
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
    </button>
  );
}
