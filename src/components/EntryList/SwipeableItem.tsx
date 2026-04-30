import React, { useRef, useState, useEffect, useCallback } from 'react';

interface SwipeAction {
  text: string;
  color: string;
  backgroundColor: string;
  onClick: () => void;
}

interface SwipeableItemProps {
  actions: SwipeAction[];
  children: React.ReactNode;
  actionWidth?: number;
}

export const SwipeableItem: React.FC<SwipeableItemProps> = ({ actions, children, actionWidth = 72 }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ startX: 0, startY: 0, base: 0, active: false, locked: false, horizontal: false, offset: 0 });
  const [isOpen, setIsOpen] = useState(false);
  const max = actions.length * actionWidth;

  const move = (x: number, animate: boolean) => {
    if (!contentRef.current) return;
    contentRef.current.style.transition = animate ? 'transform .3s ease-out' : 'none';
    contentRef.current.style.transform = `translateX(${x}px)`;
    drag.current.offset = x;
  };

  const onDragStart = (x: number, y: number) => {
    drag.current = { ...drag.current, startX: x, startY: y, base: drag.current.offset, active: true, locked: false, horizontal: false };
  };

  const onDragMove = (x: number, y: number) => {
    const d = drag.current;
    if (!d.active) return false;
    const dx = x - d.startX, dy = y - d.startY;
    if (!d.locked) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) { d.locked = true; d.horizontal = Math.abs(dx) > Math.abs(dy); }
      return false;
    }
    if (!d.horizontal) { d.active = false; return false; }
    let nx = d.base + dx;
    if (nx > 0) nx *= 0.2;
    else if (nx < -max) nx = -(max + (-nx - max) * 0.2);
    move(nx, false);
    return true; // consumed
  };

  const onDragEnd = () => {
    const d = drag.current;
    if (!d.active) return;
    d.active = false;
    if (-d.offset > max * 0.35) { move(-max, true); setIsOpen(true); }
    else { move(0, true); setIsOpen(false); }
  };

  // Mouse drag: attach move/up to window so drag continues outside element
  const onMouseMove = useCallback((e: MouseEvent) => { if (onDragMove(e.clientX, e.clientY)) e.preventDefault(); }, [max]);
  const onMouseUp = useCallback(() => { onDragEnd(); window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); }, [max]);

  // Defensive: if the component unmounts mid-drag, drop the window listeners.
  useEffect(() => () => {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  }, [onMouseMove, onMouseUp]);

  useEffect(() => {
    if (!isOpen) return;
    const close = (e: Event) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) { move(0, true); setIsOpen(false); }
    };
    const t = setTimeout(() => { document.addEventListener('touchstart', close, { passive: true }); document.addEventListener('mousedown', close); }, 10);
    return () => { clearTimeout(t); document.removeEventListener('touchstart', close); document.removeEventListener('mousedown', close); };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="swipeable-item-container">
      <div className="swipeable-actions">
        {actions.map((a, i) => (
          <button key={i} className="swipeable-action-btn"
            onPointerUp={(e) => { e.stopPropagation(); a.onClick(); move(0, true); setIsOpen(false); }}
            style={{ width: actionWidth, color: a.color, backgroundColor: a.backgroundColor }}>
            {a.text}
          </button>
        ))}
      </div>
      <div ref={contentRef} className="swipeable-content"
        onTouchStart={(e) => { const t = e.touches[0]; onDragStart(t.clientX, t.clientY); }}
        onTouchMove={(e) => { const t = e.touches[0]; if (onDragMove(t.clientX, t.clientY)) e.preventDefault(); }}
        onTouchEnd={onDragEnd}
        onMouseDown={(e) => { e.preventDefault(); onDragStart(e.clientX, e.clientY); window.addEventListener('mousemove', onMouseMove); window.addEventListener('mouseup', onMouseUp); }}>
        {children}
      </div>
    </div>
  );
};
