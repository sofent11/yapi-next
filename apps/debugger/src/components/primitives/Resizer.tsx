import { useEffect, useState, type ReactNode } from 'react';

interface ResizerProps {
  onResize?: (value: number) => void;
  onResizeRatio?: (ratio: number) => void;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
  min?: number;
  max?: number;
  minRatio?: number;
  maxRatio?: number;
  containerRef: React.RefObject<HTMLElement | null>;
}

export function Resizer({
  onResize,
  onResizeRatio,
  orientation = 'vertical',
  className = '',
  min = 0,
  max = 10000,
  minRatio = 0,
  maxRatio = 1,
  containerRef
}: ResizerProps) {
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!isDragging) return;

    function handleMouseMove(event: MouseEvent) {
      const container = containerRef.current;
      if (!container) return;

      const bounds = container.getBoundingClientRect();
      let value: number;
      let total: number;

      if (orientation === 'vertical') {
        value = event.clientX - bounds.left;
        total = bounds.width;
      } else {
        value = event.clientY - bounds.top;
        total = bounds.height;
      }

      let ratio = value / total;

      // Apply constraints
      const clampedValue = Math.max(min, Math.min(max, value));
      const clampedRatio = Math.max(minRatio, Math.min(maxRatio, ratio));

      if (onResize) {
        onResize(clampedValue);
      }

      if (onResizeRatio) {
        onResizeRatio(clampedRatio);
      }
    }

    function handleMouseUp() {
      setIsDragging(false);
      document.body.style.cursor = 'default';
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = orientation === 'vertical' ? 'col-resize' : 'row-resize';

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'default';
    };
  }, [isDragging, onResize, onResizeRatio, orientation, min, max, minRatio, maxRatio, containerRef]);

  return (
    <div
      className={`resizer-handle ${orientation} ${isDragging ? 'is-dragging' : ''} ${className}`}
      onMouseDown={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
    />
  );
}
