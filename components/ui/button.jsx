import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva('ui-btn', {
  variants: {
    variant: {
      default: 'ui-btn-default',
      secondary: 'ui-btn-secondary',
      ghost: 'ui-btn-ghost'
    },
    size: {
      default: 'ui-btn-size-default',
      sm: 'ui-btn-size-sm',
      lg: 'ui-btn-size-lg'
    }
  },
  defaultVariants: {
    variant: 'default',
    size: 'default'
  }
});

const Button = React.forwardRef(
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
