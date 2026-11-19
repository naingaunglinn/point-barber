import 'reflect-metadata';

import { METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it } from 'vitest';

import { AppModule } from './app.module.js';

// Task 4.20 · design D8 — the fixture endpoints live under test/ and are never part of AppModule.
// Read from the decorators' metadata: no database, no application start.

type Constructor = abstract new (...args: never[]) => unknown;

/** "<controller path>/<handler path>" of every handler reachable from a module. */
function routesOf(module: Constructor, seen = new Set<Constructor>()): string[] {
  if (seen.has(module)) return [];
  seen.add(module);
  const imports = (Reflect.getMetadata(MODULE_METADATA.IMPORTS, module) ?? []) as Constructor[];
  const controllers = (Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, module) ??
    []) as Constructor[];
  const own = controllers.flatMap((controller) => {
    const base = String(Reflect.getMetadata(PATH_METADATA, controller) ?? '');
    const prototype = controller.prototype as Record<string, unknown>;
    return Object.getOwnPropertyNames(prototype)
      .map((name) => prototype[name])
      .filter(
        (handler) => typeof handler === 'function' && Reflect.hasMetadata(METHOD_METADATA, handler),
      )
      .map((handler) =>
        `${base}/${String(Reflect.getMetadata(PATH_METADATA, handler as object))}`.replace(
          /\/+$/,
          '',
        ),
      );
  });
  return [...own, ...imports.flatMap((child) => routesOf(child, seen))];
}

describe('AppModule routes (task 4.20 · design D8)', () => {
  const routes = routesOf(AppModule);

  it('holds the two endpoints of this change', () => {
    expect(routes).toEqual(expect.arrayContaining(['v1/health', 'v1/system/status']));
  });

  it('has no /v1/_fixtures route', () => {
    expect(routes.filter((route) => route.includes('_fixtures'))).toStrictEqual([]);
  });
});
