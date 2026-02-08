import * as React from 'react';
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';

import { cn } from '@/lib/utils';

const ToggleGroup = React.forwardRef(({ className, ...props }, ref) => (
  <ToggleGroupPrimitive.Root
    ref={ref}
    className={cn('flex gap-1.5', className)}
    {...props}
  />
));
ToggleGroup.displayName = ToggleGroupPrimitive.Root.displayName;

const ToggleGroupItem = React.forwardRef(({ className, ...props }, ref) => (
  <ToggleGroupPrimitive.Item
    ref={ref}
    className={cn(
      'border border-border bg-card text-foreground-secondary rounded-full px-3 py-1 text-[0.8rem] font-medium min-h-[32px] cursor-pointer transition-all duration-200 hover:border-border-hover hover:bg-bg-subtle focus-visible:outline-2 focus-visible:outline-accent-border focus-visible:outline-offset-2 toggle-item-styled',
      className
    )}
    {...props}
  />
));
ToggleGroupItem.displayName = ToggleGroupPrimitive.Item.displayName;

export { ToggleGroup, ToggleGroupItem };
