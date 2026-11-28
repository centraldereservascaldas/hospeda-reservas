import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface InstallmentOption {
  installments: number;
  label: string;
}

interface InstallmentPickerProps {
  options: InstallmentOption[];
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  labelledBy?: string;
}

/** Compact, keyboard-accessible installment menu for checkout forms. */
export function InstallmentPicker({
  options,
  value,
  onChange,
  disabled = false,
  labelledBy,
}: InstallmentPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(
      0,
      options.findIndex((option) => option.installments === value),
    ),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();
  const selectedLabelId = useId();
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.installments === value),
  );
  const selected = options[selectedIndex];
  const menuOpen = isOpen && !disabled;

  useEffect(() => {
    if (disabled) setIsOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [menuOpen]);

  useEffect(() => {
    if (menuOpen) optionRefs.current[activeIndex]?.focus();
  }, [activeIndex, menuOpen]);

  const openAt = (index: number): void => {
    if (disabled) return;
    setActiveIndex(index);
    setIsOpen(true);
  };

  const choose = (option: InstallmentOption): void => {
    if (disabled) return;
    onChange(option.installments);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex((index + direction + options.length) % options.length);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setActiveIndex(event.key === 'Home' ? 0 : options.length - 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(options[index]);
    }
  };

  if (!selected) return null;

  return (
    <div
      ref={rootRef}
      className="relative mt-1.5"
      onBlur={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        ) {
          setIsOpen(false);
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-control border border-control-border bg-control-surface px-4 text-left text-base font-semibold text-control-foreground shadow-sm transition hover:border-control-border-hover focus-visible:border-focus-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        disabled={disabled}
        aria-labelledby={labelledBy ? `${labelledBy} ${selectedLabelId}` : undefined}
        aria-haspopup="listbox"
        aria-expanded={menuOpen}
        aria-controls={listboxId}
        onClick={() => (isOpen ? setIsOpen(false) : openAt(selectedIndex))}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && menuOpen) {
            event.preventDefault();
            setIsOpen(false);
            triggerRef.current?.focus();
            return;
          }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const direction = event.key === 'ArrowDown' ? 1 : -1;
            openAt((selectedIndex + direction + options.length) % options.length);
          }
        }}
      >
        <span id={selectedLabelId}>{selected.label}</span>
        <ChevronDown
          size={18}
          className={`shrink-0 text-slate-500 transition-transform ${menuOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {menuOpen && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Escolha o número de parcelas"
          className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-30 max-h-72 overflow-y-auto rounded-2xl border border-control-border bg-control-surface p-1.5 shadow-[0_18px_45px_-18px_rgba(15,23,42,0.38)] ring-1 ring-black/5"
        >
          {options.map((option, index) => {
            const isSelected = option.installments === value;
            return (
              <button
                key={option.installments}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                type="button"
                role="option"
                aria-selected={isSelected}
                tabIndex={activeIndex === index ? 0 : -1}
                onFocus={() => setActiveIndex(index)}
                onKeyDown={(event) => handleOptionKeyDown(event, index)}
                onClick={() => choose(option)}
                className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-control px-3.5 text-left text-sm transition ${isSelected ? 'bg-[var(--color-focus-ring-soft)] font-bold text-[var(--color-calendar-range-foreground)]' : 'font-medium text-control-foreground hover:bg-neutral-50'} focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus-ring`}
              >
                <span>{option.label}</span>
                {isSelected && (
                  <Check size={17} className="shrink-0 text-orange-800" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
