import React, { useId } from 'react';
import { WarningCircle } from './Icon';

export interface BaseFieldProps {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  containerClassName?: string;
  fullWidth?: boolean;
}

export type InputFieldProps = BaseFieldProps &
  React.InputHTMLAttributes<HTMLInputElement> & {
    as?: 'input';
  };

export type TextAreaFieldProps = BaseFieldProps &
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    as: 'textarea';
  };

export type SelectFieldProps = BaseFieldProps &
  React.SelectHTMLAttributes<HTMLSelectElement> & {
    as: 'select';
  };

export type TextFieldProps = InputFieldProps | TextAreaFieldProps | SelectFieldProps;

export const TextField = React.forwardRef<
  HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  TextFieldProps
>((props, ref) => {
  const {
    label,
    hint,
    error,
    containerClassName = '',
    fullWidth = true,
    id: explicitId,
    className = '',
    disabled,
    required,
    as = 'input',
    ...rest
  } = props;

  const generatedId = useId();
  const inputId = explicitId || generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  const describedBy = [error ? errorId : null, hint ? hintId : null]
    .filter(Boolean)
    .join(' ');

  const commonClasses = `w-full text-body text-ink placeholder:text-ink-3 bg-surface border rounded-field px-3.5 py-2.5 transition-colors focus:outline-none focus:ring-1 ${
    error
      ? 'border-danger focus:border-danger focus:ring-danger'
      : 'border-line focus:border-accent-text focus:ring-accent-text'
  } ${disabled ? 'bg-surface-2 opacity-50 cursor-not-allowed' : ''} ${className}`;

  return (
    <div className={`${fullWidth ? 'w-full' : 'inline-block'} ${containerClassName}`}>
      <label
        htmlFor={inputId}
        className="block text-label font-medium text-ink mb-1.5"
      >
        {label}
        {required && <span className="text-danger ml-0.5" aria-hidden="true">*</span>}
      </label>

      {as === 'textarea' ? (
        <textarea
          ref={ref as React.ForwardedRef<HTMLTextAreaElement>}
          id={inputId}
          disabled={disabled}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          rows={(rest as React.TextareaHTMLAttributes<HTMLTextAreaElement>).rows || 3}
          className={`${commonClasses} resize-y min-h-[80px]`}
          {...(rest as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
        />
      ) : as === 'select' ? (
        <div className="relative">
          <select
            ref={ref as React.ForwardedRef<HTMLSelectElement>}
            id={inputId}
            disabled={disabled}
            required={required}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy || undefined}
            className={`${commonClasses} min-h-[44px] appearance-none pr-10`}
            {...(rest as React.SelectHTMLAttributes<HTMLSelectElement>)}
          >
            {(rest as React.SelectHTMLAttributes<HTMLSelectElement>).children}
          </select>
          <div
            className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-ink-3"
            aria-hidden="true"
          >
            <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
              <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
            </svg>
          </div>
        </div>
      ) : (
        <input
          ref={ref as React.ForwardedRef<HTMLInputElement>}
          id={inputId}
          disabled={disabled}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={`${commonClasses} min-h-[44px]`}
          {...(rest as React.InputHTMLAttributes<HTMLInputElement>)}
        />
      )}

      {error ? (
        <div
          id={errorId}
          role="alert"
          className="flex items-center gap-1.5 mt-1.5 text-caption text-danger"
        >
          <WarningCircle size={14} weight="fill" className="flex-shrink-0" />
          <span>{error}</span>
        </div>
      ) : hint ? (
        <p id={hintId} className="text-caption text-ink-3 mt-1.5">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

TextField.displayName = 'TextField';
