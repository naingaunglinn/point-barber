import { Injectable } from '@nestjs/common';

import { TransactionScope } from '../database/transaction-scope.js';
import { BackgroundTasks } from '../http/background-tasks.js';

// In-process events (ADR-001 rule 1 · add-foundation-auth-access design D1 · D3): a module tells
// another module what happened without a call into it. An event is collected inside the transaction
// that caused it and delivered by TransactionRunner after commit — never after a rollback. Each
// handler runs as a background task: it opens its own transaction, and its failure is logged.
export interface DomainEvent {
  readonly name: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

type Handler = (event: DomainEvent) => Promise<void> | void;

@Injectable()
export class DomainEvents {
  private readonly handlers = new Map<string, Handler[]>();

  constructor(private readonly background: BackgroundTasks) {}

  on(name: string, handler: Handler): void {
    this.handlers.set(name, [...(this.handlers.get(name) ?? []), handler]);
  }

  /** Keeps the event until the current transaction commits. */
  collect(event: DomainEvent): void {
    TransactionScope.require('DomainEvents.collect').events.push(event);
  }

  /** Called by TransactionRunner once the transaction has committed. */
  deliver(events: readonly DomainEvent[]): void {
    for (const event of events) {
      for (const handler of this.handlers.get(event.name) ?? []) {
        this.background.run(() => handler(event));
      }
    }
  }
}
