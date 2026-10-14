import type { ReactNode } from 'react';

// Types shared by the components (design D10).

/** An action a component offers; `allowed: false` hides it (the caller decides with can()). */
export interface Action {
  /** Translated verb. */
  readonly label: string;
  readonly onPress: () => void | Promise<unknown>;
  readonly allowed?: boolean;
  readonly destructive?: boolean;
}

/** The fields of a card: 1 to 4 (AD-LIST-02) — a fifth does not compile. */
export type CardFields =
  | readonly [ReactNode]
  | readonly [ReactNode, ReactNode]
  | readonly [ReactNode, ReactNode, ReactNode]
  | readonly [ReactNode, ReactNode, ReactNode, ReactNode];

/** A row as a card: the first field is its title; at most one inline primary action. */
export interface CardSpec {
  readonly fields: CardFields;
  readonly action?: Action;
}
