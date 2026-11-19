import { randomUUID } from 'node:crypto';

import type { SaleDto, VisitDto } from '@point/shared';
import { FIXTURE_IDS } from '@point/shared/testing';
import type { Response } from 'supertest';

import type { FixturePerson, SeededApp } from './seeded.js';

// add-walkin-visit-checkout — the walk-in endpoints as the staff app calls them: a session per fixture
// person (signed in once per test file), the app's CSRF headers, an Idempotency-Key where the endpoint
// takes one. `start` / `pay` / `complete` / `finish` are the happy-path steps the scenario tests build on.

const { branches, services } = FIXTURE_IDS;
const API = '/api/v1';

/** The branch each person of spec-fixtures §2 works at (U Kyaw Zin starts at B3). */
export const BRANCH_OF: Partial<Record<FixturePerson, string>> = {
  E001: branches.B3,
  E002: branches.B3,
  E003: branches.B1,
  E004: branches.B3,
  E005: branches.B3,
  E006: branches.B1,
};

export interface WalkinHttp {
  cookie(who: FixturePerson): Promise<string>;
  get(who: FixturePerson, path: string): Promise<Response>;
  post(who: FixturePerson, path: string, body?: object, key?: string): Promise<Response>;
  start(who: FixturePerson, items?: readonly string[]): Promise<VisitDto>;
  complete(who: FixturePerson, visitId: string): Promise<VisitDto>;
  pay(who: FixturePerson, saleId: string, body: Record<string, unknown>): Promise<SaleDto>;
  finish(who: FixturePerson, saleId: string, body: Record<string, unknown>): Promise<SaleDto>;
}

export function walkinHttp(s: SeededApp): WalkinHttp {
  const sessions = new Map<FixturePerson, string>();
  const cookie = async (who: FixturePerson): Promise<string> => {
    const known = sessions.get(who);
    if (known !== undefined) return known;
    const { cookie: fresh } = await s.signIn(who);
    sessions.set(who, fresh);
    return fresh;
  };
  const get = async (who: FixturePerson, path: string): Promise<Response> =>
    s.http.get(`${API}${path}`).set('Cookie', await cookie(who));
  const post = async (who: FixturePerson, path: string, body: object = {}, key?: string) => {
    const req = s.http.post(`${API}${path}`).set('Cookie', await cookie(who));
    return (key === undefined ? req : req.set('Idempotency-Key', key)).send(body);
  };

  const start = async (
    who: FixturePerson,
    items: readonly string[] = [services.HAIRCUT],
  ): Promise<VisitDto> => {
    const branch = BRANCH_OF[who];
    if (branch === undefined) throw new Error(`${who} has no fixture branch`);
    const res = await post(
      who,
      '/visits',
      { branch_id: branch, items: items.map((service_id) => ({ service_id })) },
      randomUUID(),
    );
    if (res.status !== 201) throw new Error(`START ${res.status} ${JSON.stringify(res.body)}`);
    return res.body as VisitDto;
  };
  const complete = async (who: FixturePerson, visitId: string): Promise<VisitDto> => {
    const res = await post(who, `/visits/${visitId}/complete`);
    if (res.status !== 200) throw new Error(`COMPLETE ${res.status} ${JSON.stringify(res.body)}`);
    return res.body as VisitDto;
  };
  const pay = async (
    who: FixturePerson,
    saleId: string,
    body: Record<string, unknown>,
  ): Promise<SaleDto> => {
    const res = await post(who, `/sales/${saleId}/payments`, body, randomUUID());
    if (res.status !== 201) throw new Error(`PAY ${res.status} ${JSON.stringify(res.body)}`);
    return res.body as SaleDto;
  };
  const finish = async (
    who: FixturePerson,
    saleId: string,
    body: Record<string, unknown>,
  ): Promise<SaleDto> => {
    const res = await post(who, `/sales/${saleId}/finish`, body);
    if (res.status !== 200) throw new Error(`FINISH ${res.status} ${JSON.stringify(res.body)}`);
    return res.body as SaleDto;
  };

  return { cookie, get, post, start, complete, pay, finish };
}
