import { Children, cloneElement, isValidElement, useId } from 'react';
import type { ReactElement, ReactNode } from 'react';

interface NativeFieldProps {
  id?: string;
  required?: boolean;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'grammar' | 'spelling';
}

interface FormFieldProps {
  id?: string;
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  density?: 'regular' | 'compact';
  children: ReactElement<NativeFieldProps>;
}

export function FormField({
  id,
  label,
  hint,
  error,
  required = false,
  className = '',
  density = 'regular',
  children,
}: FormFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const child = Children.only(children);

  if (!isValidElement<NativeFieldProps>(child)) {
    throw new Error('FormField deve receber um único controle React.');
  }

  const describedBy = [child.props['aria-describedby'], hintId, errorId]
    .filter((value): value is string => Boolean(value))
    .join(' ');
  const control = cloneElement(child, {
    id: child.props.id ?? fieldId,
    required: required || child.props.required,
    'aria-invalid': error ? true : child.props['aria-invalid'],
    'aria-describedby': describedBy || undefined,
  });

  const labelClassName =
    density === 'compact'
      ? 'block text-xs font-bold text-neutral-700'
      : 'block text-sm font-semibold text-neutral-800';

  return (
    <div className={className}>
      <label htmlFor={fieldId} className={labelClassName}>
        {label}
        {required && (
          <span aria-hidden="true" className="ml-1 text-rose-700">
            *
          </span>
        )}
      </label>
      {control}
      {hint && (
        <p id={hintId} className="mt-1 text-xs font-normal leading-5 text-neutral-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1 text-sm font-normal leading-5 text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}
