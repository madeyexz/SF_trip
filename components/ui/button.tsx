import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 font-bold text-[0.84rem] uppercase tracking-wider rounded-none border border-border cursor-pointer transition-all duration-200 ease-out focus-visible:outline-2 focus-visible:outline-accent-border focus-visible:outline-offset-2 disabled:opacity-55 disabled:cursor-not-allowed disabled:pointer-events-none',
  {
    variants: {
      variant: {
        default: 'bg-accent border-transparent text-[#0C0C0C] hover:brightness-110 active:brightness-95',
        secondary: 'bg-card text-foreground hover:border-accent-border hover:bg-accent-light hover:text-accent',
        ghost: 'bg-transparent border-transparent hover:bg-accent-light',
        danger: 'bg-danger-light border-danger-border text-[#FF4444] hover:bg-[rgba(255,68,68,0.15)] hover:border-[rgba(255,68,68,0.5)]'
      },
      size: {
        default: 'min-h-[38px] px-4 py-2',
        sm: 'min-h-[32px] px-2.5 py-1 text-[0.82rem]',
        lg: 'min-h-[44px] px-5 py-2.5 text-[0.95rem]'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
