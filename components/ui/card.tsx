import * as React from 'react';

import { cn } from '@/lib/utils';

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('border border-border rounded-[14px] bg-card transition-[border-color,box-shadow] duration-200', className)} {...props} />
));
Card.displayName = 'Card';

export { Card };
