import 'reflect-metadata';

import { RequestMethod } from '@nestjs/common';
import { HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it } from 'vitest';

import { parseBranchPath } from '../../../common/access/paths.js';
import { ACCESS_METADATA } from '../../../common/access/public.decorator.js';
import { EMPLOYEE_UPDATE_FIELDS } from './employee-fields.js';
import { EmployeesController } from './employees.controller.js';

// add-employee-management task 2.4 — the 12 routes of design D2, each with exactly one access
// declaration (API-PERM-02), read from the decorators' metadata: no database, no application start.

const METHODS: Record<number, string> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.PATCH]: 'PATCH',
};

const prototype = EmployeesController.prototype as unknown as Record<string, unknown>;
const ROUTES = Object.getOwnPropertyNames(prototype)
  .map((name) => prototype[name])
  .filter((handler): handler is object => typeof handler === 'function')
  .filter((handler) => Reflect.hasMetadata(METHOD_METADATA, handler))
  .map((handler) => {
    const base = String(Reflect.getMetadata(PATH_METADATA, EmployeesController));
    const path = `/${base}/${String(Reflect.getMetadata(PATH_METADATA, handler))}`
      .replace(/\/+$/, '')
      .replace(/\/{2,}/g, '/');
    return {
      route: `${METHODS[Number(Reflect.getMetadata(METHOD_METADATA, handler))] ?? '?'} ${path}`,
      status: Reflect.getMetadata(HTTP_CODE_METADATA, handler) as number | undefined,
      access: Reflect.getMetadata(ACCESS_METADATA, handler) as unknown,
    };
  });

const can = (code: string, options: object) => ({ kind: 'can', code, ...options });
const target = { target: 'employee:id' };

describe('add-employee-management · the employee routes (design D2)', () => {
  it('has 12 routes, each with exactly one access declaration', () => {
    expect(ROUTES).toHaveLength(12);
    for (const { access } of ROUTES) expect(access).toBeTypeOf('object');
  });

  it('declares each route as the table of D2 says', () => {
    expect(Object.fromEntries(ROUTES.map((entry) => [entry.route, entry.access]))).toStrictEqual({
      'GET /v1/employees': { kind: 'canView', module: 'employee' },
      'POST /v1/employees': can('employee.create', { branch: 'body.branch_ids[]' }),
      'GET /v1/employees/:id': {
        kind: 'canView',
        module: 'employee',
        target: 'employee:id',
        orSelf: 'employee.id',
      },
      'PATCH /v1/employees/:id': {
        kind: 'canFields',
        fields: EMPLOYEE_UPDATE_FIELDS,
        target: 'employee:id',
      },
      'POST /v1/employees/:id/status': can('employee.delete', target),
      'PUT /v1/employees/:id/public-rating': can('employee.rating_update', target),
      'POST /v1/employees/:id/branches': can('employee.branch_assign', {
        branch: 'body.branch_id',
        target: 'employee:id',
      }),
      'POST /v1/employees/:id/branches/:assignment_id/end': can('employee.branch_assign', {
        branch: 'params.assignment_id→entity.branch_id',
      }),
      'POST /v1/employees/:id/invite/resend': can('employee.access_update', target),
      'POST /v1/employees/:id/invite/cancel': can('employee.access_update', target),
      'GET /v1/employees/:id/sessions': can('employee.access_update', target),
      'POST /v1/employees/:id/sessions/revoke-all': can('employee.access_update', target),
    });
  });

  it('groups the members of the update as P1.EMP.04 says', () => {
    expect(EMPLOYEE_UPDATE_FIELDS).toMatchObject({
      employee_code: 'employee.update',
      public_profile: 'employee.update',
      public_rating: 'employee.rating_update',
      show_own_earnings: 'employee.earnings_update',
      photo_attachment_id: 'employee.update',
    });
  });

  it('answers 201 (create has none set), 200, 202 and 204 as the OpenAPI document says', () => {
    const status = Object.fromEntries(ROUTES.map((entry) => [entry.route, entry.status]));
    expect(status['POST /v1/employees/:id/status']).toBe(200);
    expect(status['POST /v1/employees/:id/branches/:assignment_id/end']).toBe(200);
    expect(status['POST /v1/employees/:id/invite/resend']).toBe(202);
    expect(status['POST /v1/employees/:id/invite/cancel']).toBe(200);
    expect(status['POST /v1/employees/:id/sessions/revoke-all']).toBe(204);
    expect(status['POST /v1/employees']).toBeUndefined();
    expect(status['POST /v1/employees/:id/branches']).toBeUndefined();
  });

  it('every branch path is one the access guard reads', () => {
    for (const { access } of ROUTES) {
      const branch = (access as { branch?: string }).branch;
      if (branch !== undefined) expect(() => parseBranchPath(branch)).not.toThrow();
    }
  });
});
