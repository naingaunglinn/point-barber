import {
  Calendar,
  Circle,
  CircleCheck,
  CircleDot,
  CircleSlash,
  CircleX,
  Clock,
  ClockAlert,
  Coins,
  Globe,
  Hand,
  House,
  Lock,
  LogOut,
  Package,
  Pencil,
  Receipt,
  RotateCcw,
  Send,
  Tag,
  TriangleAlert,
  UserX,
  Users,
  type LucideIcon,
} from 'lucide-react';

import type { IconName, Tone } from './status-map';

// How a tone looks (AD-CMP-05 · AD-A11Y-03 · FE-VIS-01a · design D8). Muted and danger are outline
// badges in both trees: muted text on --muted is 4.35 : 1 in the staff tree, and on the site --destructive
// on --muted is 4.21 : 1. Info, success and warning sit on their -subtle background (site 5.05 / 7.84 /
// 7.17 : 1; in the staff tree they are --foreground on --muted until the admin palette arrives).

export const TONE_CLASS: Readonly<Record<Tone, string>> = {
  neutral: 'border-border bg-transparent text-foreground',
  info: 'border-transparent bg-info-subtle text-info',
  success: 'border-transparent bg-success-subtle text-success',
  warning: 'border-transparent bg-warning-subtle text-warning',
  danger: 'border-destructive bg-transparent text-destructive',
  muted: 'border-border bg-transparent text-muted-foreground',
};

export const ICONS: Readonly<Record<IconName, LucideIcon>> = {
  circle: Circle,
  'circle-dot': CircleDot,
  'circle-check': CircleCheck,
  'triangle-alert': TriangleAlert,
  'circle-x': CircleX,
  'circle-slash': CircleSlash,
  lock: Lock,
  send: Send,
  clock: Clock,
  users: Users,
  home: House,
  globe: Globe,
  pencil: Pencil,
  tag: Tag,
  package: Package,
  hand: Hand,
  'clock-alert': ClockAlert,
  'user-x': UserX,
  'log-out': LogOut,
  calendar: Calendar,
  receipt: Receipt,
  coins: Coins,
  'rotate-ccw': RotateCcw,
};

/** The icons of a badge or a chip, decorative: the text says it. */
export function ToneIcons({ names }: Readonly<{ names: readonly IconName[] }>) {
  return names.map((name) => {
    const Icon = ICONS[name];
    return <Icon key={name} aria-hidden data-icon={name} className="size-3.5 shrink-0" />;
  });
}
