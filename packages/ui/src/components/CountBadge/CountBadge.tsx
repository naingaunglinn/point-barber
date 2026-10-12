// The count on an icon (AD-NTF-01 · AD-NAV-01 · design D10): unread notifications on the bell, unfinished
// work on a navigation item. One look everywhere — anchored to the icon's top-right corner and growing
// outwards, 20 px high, `99+` above 99 and nothing at 0. Its text is part of the control's accessible
// name ("Notifications 2"), so it is never `aria-hidden`.

/** `99+` above 99; nothing at 0. */
export function countText(count: number): string | null {
  if (count <= 0) return null;
  return count > 99 ? '99+' : String(count);
}

/** Place inside a `relative` box around the icon. */
export function CountBadge({ count }: { readonly count: number }) {
  const text = countText(count);
  if (text === null) return null;
  return (
    <span
      data-slot="count-badge"
      className="absolute start-full -top-1.5 -ms-2.5 h-5 min-w-5 rounded-full bg-destructive px-1 text-center text-xs leading-5 font-semibold text-destructive-foreground tabular-nums"
    >
      {text}
    </span>
  );
}
