import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

interface DropdownOption {
  value: string;
  label: string;
  color?: string;
  disabled?: boolean;
}

interface DropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  style?: React.CSSProperties;
}

export const Dropdown: React.FC<DropdownProps> = ({
  options,
  value,
  onChange,
  disabled,
  placeholder,
  style
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(null);

  const selectedOption = options.find(o => o.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const isInsidePortal = target.closest('.dropdown-menu');
      if (containerRef.current && !containerRef.current.contains(target) && !isInsidePortal) {
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
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setMenuRect({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width
      });
    }
  };

  const handleToggle = () => {
    if (!disabled) setIsOpen(!isOpen);
  };

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  const menuList = isOpen && menuRect && createPortal(
    <div
      className="dropdown-menu glass-panel"
      style={{
        position: 'absolute',
        top: `${menuRect.top + 8}px`,
        left: `${menuRect.left}px`,
        width: `${menuRect.width}px`,
        zIndex: 1000,
        maxHeight: '240px',
        overflowY: 'auto',
        padding: '6px',
        background: 'var(--surface-color)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid var(--surface-border)',
        borderRadius: 'var(--radius-md)',
        animation: 'dropdown-in 0.15s ease-out',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
      }}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`dropdown-item ${option.value === value ? 'selected' : ''}`}
          disabled={option.disabled}
          onClick={() => handleSelect(option.value)}
          style={{
            color: 'var(--text-primary)',
            opacity: option.disabled ? 0.4 : 1,
            cursor: option.disabled ? 'not-allowed' : 'pointer',
          }}
        >
          <span style={{ color: option.color || 'inherit' }}>{option.label}</span>
          {option.value === value && (
            <div style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: option.color || 'var(--text-primary)',
            }} />
          )}
        </button>
      ))}
    </div>,
    document.body
  );

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', ...style }}>
      <div
        onClick={handleToggle}
        className={`dropdown-trigger ${isOpen ? 'open' : ''}`}
        style={{
          opacity: disabled ? 0.6 : 1,
          boxShadow: isOpen ? '0 0 20px rgba(56, 189, 248, 0.15)' : 'none'
        }}
      >
        <span style={{
          color: selectedOption?.color || (value ? 'var(--text-primary)' : 'var(--text-secondary)'),
          fontWeight: value ? 600 : 400,
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          {selectedOption ? selectedOption.label : placeholder || 'Select...'}
        </span>
        <ChevronDown
          size={20}
          style={{
            color: 'var(--text-secondary)',
            transform: isOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            opacity: 0.7
          }}
        />
      </div>
      {menuList}
    </div>
  );
};
