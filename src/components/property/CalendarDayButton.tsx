import type { ComponentPropsWithRef } from 'react';

interface CalendarDayVisualState {
  preview: 'valid' | 'invalid' | null;
  restricted: boolean;
  blocked: boolean;
  selected: boolean;
  inRange: boolean;
  disabled: boolean;
}

type CalendarDayButtonProps = ComponentPropsWithRef<'button'> & {
  visualState: CalendarDayVisualState;
};

export function CalendarDayButton({
  visualState: state,
  className = '',
  ...props
}: CalendarDayButtonProps) {
  const appearance = state.preview
    ? state.preview === 'valid'
      ? 'bg-calendar-range text-calendar-range-foreground ring-1 ring-orange-300'
      : 'bg-rose-100 text-rose-900 ring-1 ring-rose-300'
    : state.restricted && !state.selected && !state.inRange
      ? `bg-calendar-muted text-calendar-muted-foreground ${state.disabled ? 'cursor-not-allowed' : 'hover:bg-orange-50'}`
      : state.blocked && !state.inRange
        ? 'relative cursor-not-allowed bg-calendar-unavailable text-calendar-unavailable-foreground'
        : state.selected
          ? 'bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/20'
          : state.inRange
            ? 'bg-calendar-range text-calendar-range-foreground'
            : state.disabled
              ? 'cursor-not-allowed bg-calendar-muted text-calendar-muted-foreground'
              : 'text-neutral-700 hover:bg-orange-50 hover:text-orange-800';
  return (
    <button
      {...props}
      className={`h-11 w-full rounded-xl text-xs font-semibold transition ${appearance} focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-600 disabled:hover:bg-inherit ${className}`}
    />
  );
}
