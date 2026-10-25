import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';

export type ButtonVariant = 'primary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
}

export default function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  type = 'button',
  ...rest
}: PropsWithChildren<ButtonProps>) {
  return (
    <button
      type={type}
      className={`tw-btn tw-btn-${variant} ${size === 'sm' ? 'tw-btn-sm' : ''} ${className ?? ''}`.trim()}
      {...rest}
    >
      {children}
    </button>
  );
}
