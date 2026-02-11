import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 font-semibold text-[0.84rem] rounded-[10px] border border-border cursor-pointer transition-all duration-200 ease-out focus-visible:outline-2 focus-visible:outline-accent-border focus-visible:outline-offset-2 disabled:opacity-55 disabled:cursor-not-allowed disabled:pointer-events-none',
  {
    variants: {
      variant: {
        default: 'bg-gradient-to-br from-[#4b7bf7] to-[#3060e8] border-transparent text-white shadow-[0_1px_3px_rgba(59,108,245,0.3),inset_0_1px_0_rgba(255,255,255,0.12)] hover:from-[#5a87f9] hover:to-[#2550d0] hover:shadow-[0_3px_12px_rgba(59,108,245,0.3)] hover:-translate-y-px active:translate-y-0',
        secondary: 'bg-card text-foreground shadow-[0_1px_2px_rgba(12,18,34,0.04)] hover:border-accent-border hover:bg-accent-light hover:text-accent hover:shadow-[0_0_0_3px_var(--color-accent-glow)]',
        ghost: 'bg-transparent border-transparent hover:bg-accent-light'
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
