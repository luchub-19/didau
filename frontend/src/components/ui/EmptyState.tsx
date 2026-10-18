import React from 'react';

export interface EmptyStateProps {
  icon: React.ReactNode;
  title: React.ReactNode;
  description: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center rounded-card bg-surface border border-line ${className}`}
    >
      <div
        className="w-14 h-14 rounded-full bg-surface-2 text-ink-2 flex items-center justify-center mb-3"
        aria-hidden="true"
      >
        {icon}
      </div>
      <h3 className="text-heading font-semibold text-ink mb-1.5">{title}</h3>
      <p className="text-body text-ink-2 max-w-sm mb-5">{description}</p>
      {action && <div className="flex items-center justify-center">{action}</div>}
    </div>
  );
};
