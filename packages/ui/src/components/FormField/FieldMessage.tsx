import { CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

// A validation message under a field (AD-FORM-02 · D-UI-01): never colour alone — the alert icon, the
// text from the language file, both in --destructive (AD-A11Y-03). The id is what the field's
// aria-describedby points at; the icon is decoration for screen readers.
export function FieldMessage({ id, children }: Readonly<{ id: string; children: ReactNode }>) {
  return (
    <p
      id={id}
      className="flex items-start gap-1.5 text-sm text-destructive"
      data-slot="field-message"
    >
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
