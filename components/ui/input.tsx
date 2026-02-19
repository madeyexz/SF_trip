import * as React from 'react';

import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        'flex-1 min-h-[36px] min-w-0 rounded-none border border-border bg-bg-elevated px-3 py-1.5 text-[0.84rem] text-foreground outline-none transition-[border-color] duration-150 placeholder:text-muted focus:border-accent disabled:opacity-55 disabled:cursor-not-allowed',
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = 'Input';

export { Input };
