import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  interactive?: boolean;
  floating?: boolean;
  as?: 'div' | 'article' | 'section';
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  (
    {
      children,
      interactive = false,
      floating = false,
      as: Component = 'div',
      className = '',
      onClick,
      ...rest
    },
    ref,
  ) => {
    const isInteractive = interactive || !!onClick;

    const commonClasses = `rounded-card bg-surface border border-line p-4 transition-colors ${
      floating ? 'shadow-float' : ''
    } ${
      isInteractive
        ? 'cursor-pointer [@media(hover:hover)]:hover:border-accent/40 active:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-text'
        : ''
    } ${className}`;

    const interactiveProps = isInteractive
      ? { tabIndex: rest.tabIndex ?? 0, role: rest.role ?? 'button' }
      : {};

    if (Component === 'article') {
      return (
        <article
          ref={ref as React.Ref<HTMLElement>}
          onClick={onClick}
          className={commonClasses}
          {...interactiveProps}
          {...rest}
        >
          {children}
        </article>
      );
    }

    if (Component === 'section') {
      return (
        <section
          ref={ref as React.Ref<HTMLElement>}
          onClick={onClick}
          className={commonClasses}
          {...interactiveProps}
          {...rest}
        >
          {children}
        </section>
      );
    }

    return (
      <div
        ref={ref}
        onClick={onClick}
        className={commonClasses}
        {...interactiveProps}
        {...rest}
      >
        {children}
      </div>
    );
  },
);

Card.displayName = 'Card';
