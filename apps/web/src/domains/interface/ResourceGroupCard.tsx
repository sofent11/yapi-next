import type { DragEvent, KeyboardEvent, MouseEvent, ReactNode } from 'react';
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
  onDragStart?: (event: DragEvent<HTMLElement>) => void;
  onDragEnd?: () => void;
  onDragOver?: (event: DragEvent<HTMLElement>) => void;
  onDrop?: (event: DragEvent<HTMLElement>) => void;
  onContextMenu?: (event: MouseEvent<HTMLDivElement>) => void;
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
        onMouseDown={event => {
          if (event.button === 2) {
            event.preventDefault();
          }
        }}
        onContextMenu={props.onContextMenu}
      >
        <div className="interface-nav-group-main flex-1">
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
          <button
            type="button"
            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-left text-inherit"
            draggable={props.dragEnabled}
            onDragStart={props.onDragStart}
            onDragEnd={props.onDragEnd}
            onClick={props.onNavigate}
            onKeyDown={props.onKeyNavigate}
            aria-current={props.active ? 'page' : undefined}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              {props.folderIcon}
              <span className="interface-nav-group-name">{props.name}</span>
            </span>
          </button>
        </div>

        <div className="interface-nav-group-actions flex items-center gap-1">
          {props.actions}
          <Badge variant="light" color="gray">{props.count}</Badge>
        </div>
      </div>

      {props.children}
    </div>
  );
}
