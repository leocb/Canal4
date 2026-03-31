import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface DropdownMenuProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'left' | 'right';
  minWidth?: string;
  className?: string;
}

export const DropdownMenuItem: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  selected?: boolean;
  color?: string;
  danger?: boolean;
}> = ({ children, onClick, selected, color, danger }) => {
  return (
    <button
      className={`dropdown-item ${selected ? 'selected' : ''} ${danger ? 'danger' : ''}`}
      onClick={onClick}
      style={color ? { color } : undefined}
    >
      <span>{children}</span>
      {selected && (
        <div style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: color || 'var(--text-primary)',
        }} />
      )}
    </button>
  );
};

export const DropdownMenu: React.FC<DropdownMenuProps> = ({
  trigger,
  children,
  align = 'right',
  minWidth = '200px',
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; right: number } | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (triggerRef.current && !triggerRef.current.contains(event.target as Node)) {
        const target = event.target as HTMLElement;
        if (target.closest('.dropdown-menu')) return;
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      updatePosition();
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen]);

  const updatePosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const right = window.innerWidth - rect.right;
      setMenuRect({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        right: right - window.scrollX
      });
    }
  };

  const toggleMenu = () => setIsOpen(!isOpen);

  const portalContent = isOpen && menuRect && createPortal(
    <div
      className="dropdown-menu glass-panel"
      style={{
        position: 'absolute',
        top: `${menuRect.top + 8}px`,
        [align]: align === 'left' ? `${menuRect.left}px` : `${menuRect.right}px`,
        zIndex: 1000,
        minWidth: minWidth,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface-color)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid var(--surface-border)',
        borderRadius: 'var(--radius-md)',
        animation: 'dropdown-in 0.15s ease-out',
        padding: '6px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
      }}
      onClick={() => setIsOpen(false)}
    >
      {children}
    </div>,
    document.body
  );

  return (
    <div style={{ position: 'relative' }} ref={triggerRef} className={className}>
      <div onClick={toggleMenu} style={{ cursor: 'pointer' }}>
        {trigger}
      </div>
      {portalContent}
    </div>
  );
};
