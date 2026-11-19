import { Injectable } from '@nestjs/common';

import type { RequestParts } from './paths.js';

// The two registries of design D11. A module that owns an entity registers the loader that tells the
// access guard which branches the entity belongs to; a module that has its own "who is the subject"
// rule registers it as a named orSelf resolver (add-walkin-visit-checkout: `visit.lineActors` …). The
// registries live in common/access, so the guard never imports a module.

/** What a loader returns for an id: the entity's branches and the fields an orSelf path reads. */
export interface LoadedTarget {
  readonly branch_ids: readonly string[];
  /** `all` (default): every branch must be covered; `any`: one covered branch is enough. */
  readonly match?: 'all' | 'any';
  readonly [field: string]: unknown;
}

export type TargetLoader = (id: string) => Promise<LoadedTarget | null>;

/** The key of the P1-RULE-11 employee target (`target: 'employee:<param>'`), registered by people. */
export const EMPLOYEE_TARGET = 'employee';

/** The route key of an entity path: `<METHOD> <route pattern>`, e.g. `GET /v1/employees/:id`. */
export const routeKey = (method: string, pattern: string): string =>
  `${method.toUpperCase()} ${pattern.replace(/^\/api(?=\/)/, '')}`;

@Injectable()
export class TargetResolvers {
  private readonly loaders = new Map<string, TargetLoader>();

  /** Registers one loader for one or more route keys (or for `employee`). */
  register(keys: string | readonly string[], loader: TargetLoader): void {
    for (const key of typeof keys === 'string' ? [keys] : keys) {
      if (this.loaders.has(key)) throw new Error(`target resolver ${key} is already registered`);
      this.loaders.set(key, loader);
    }
  }

  get(key: string): TargetLoader {
    const loader = this.loaders.get(key);
    if (loader === undefined) throw new Error(`no target resolver registered for ${key}`);
    return loader;
  }
}

/** The caller as an orSelf resolver sees them. */
export interface Caller {
  readonly userId: string;
  readonly employeeId: string;
}

export type OrSelfResolver = (parts: RequestParts, caller: Caller) => Promise<boolean> | boolean;

@Injectable()
export class OrSelfResolvers {
  private readonly resolvers = new Map<string, OrSelfResolver>();

  register(name: string, resolver: OrSelfResolver): void {
    if (this.resolvers.has(name)) throw new Error(`orSelf resolver ${name} is already registered`);
    this.resolvers.set(name, resolver);
  }

  get(name: string): OrSelfResolver {
    const resolver = this.resolvers.get(name);
    if (resolver === undefined) throw new Error(`no orSelf resolver registered as ${name}`);
    return resolver;
  }
}
