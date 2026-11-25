import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'quiet';

type PortalButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  leadingIcon?: ReactNode;
};

export function PortalButton({
  variant = 'secondary',
  leadingIcon,
  className = '',
  children,
  ...props
}: PortalButtonProps) {
  return (
    <button
      {...props}
      className={`portal-button portal-button--${variant} ${className}`.trim()}
    >
      {leadingIcon}
      {children}
    </button>
  );
}

type PortalCardProps = HTMLAttributes<HTMLElement> & {
  as?: 'article' | 'section';
};

export function PortalCard({ as = 'section', className = '', ...props }: PortalCardProps) {
  const Component = as;
  return <Component {...props} className={`portal-card ${className}`.trim()} />;
}

type PortalStatusProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: 'neutral' | 'green' | 'amber' | 'blue' | 'red';
  children: ReactNode;
};

export function PortalStatus({
  tone = 'neutral',
  className = '',
  children,
  ...props
}: PortalStatusProps) {
  return (
    <span {...props} className={`portal-status portal-status--${tone} ${className}`.trim()}>
      <span className="portal-status__dot" aria-hidden="true" />
      {children}
    </span>
  );
}

export function PortalPageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="portal-page-heading">
      <div>
        <p className="portal-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="portal-page-description">{description}</p>
      </div>
      {action}
    </header>
  );
}
