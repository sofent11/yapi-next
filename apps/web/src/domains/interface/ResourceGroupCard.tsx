import type { DragEvent, KeyboardEvent, ReactNode } from 'react';
import { Badge } from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';

type ResourceGroupCardProps = {
  active?: boolean;
  expanded: boolean;
  name: ReactNode;
  count: ReactNode;
  folderIcon?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  dragEnabled?: boolean;
  onToggle: () => void;
  onNavigate: () => void;
  onKeyNavigate: (event: KeyboardEvent<HTMLElement>) => void;
  onDragStart?: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onDrop?: (event: DragEvent<HTMLDivElement>) => void;
  toggleLabelExpanded: string;
  toggleLabelCollapsed: string;
};

export function ResourceGroupCard(props: ResourceGroupCardProps) {
  return (
    <div
      className="interface-nav-group"
      onDragOver={props.onDragOver}
      onDrop={props.onDrop}
    >
      <div
        className={`interface-nav-group-title${props.active ? ' active' : ''}`}
        role="button"
        tabIndex={0}
        aria-expanded={props.expanded}
        aria-current={props.active ? 'page' : undefined}
        draggable={props.dragEnabled}
        onDragStart={props.onDragStart}
        onDragEnd={props.onDragEnd}
        onClick={props.onNavigate}
        onKeyDown={props.onKeyNavigate}
      >
        <span className="interface-nav-group-main">
          <button
            type="button"
            className="interface-nav-group-toggle"
            onClick={event => {
              event.preventDefault();
              event.stopPropagation();
              props.onToggle();
            }}
            aria-label={props.expanded ? props.toggleLabelExpanded : props.toggleLabelCollapsed}
            aria-expanded={props.expanded}
          >
            {props.expanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
          </button>
          {props.folderIcon}
          <span className="interface-nav-group-name">{props.name}</span>
        </span>

        <div className="interface-nav-group-actions flex items-center gap-1">
          {props.actions}
          <Badge variant="light" color="gray">{props.count}</Badge>
        </div>
      </div>

      {props.children}
    </div>
  );
}
