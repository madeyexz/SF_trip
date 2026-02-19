import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-none border px-2.5 py-0.5 text-[0.68rem] font-bold uppercase tracking-wider',
  {
    variants: {
      variant: {
        default: 'bg-accent-light border-accent-border text-accent',
        secondary: 'bg-bg-subtle border-border text-foreground-secondary',
        warning: 'bg-warning-light border-warning-border text-warning',
        danger: 'bg-danger-light border-danger-border text-danger'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
);

function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
