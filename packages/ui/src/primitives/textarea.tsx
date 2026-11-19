import * as React from 'react';
import { cn } from 'cn';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex field-sizing-content min-h-16 w-full rounded-lg border border-[var(--field-border)] bg-transparent px-2.5 py-2 text-base transition-colors placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 aria-invalid:border-destructive aria-invalid:outline-2 aria-invalid:outline-destructive',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
