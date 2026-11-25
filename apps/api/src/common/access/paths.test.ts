import { describe, expect, it } from 'vitest';

import { branchIdsAt, parseBranchPath } from './paths.js';

// add-employee-management task 2.2 — the list-of-ids path `body.branch_ids[]` of `POST /v1/employees`
// (design D2), beside the list-of-objects path the guard already reads.

const at = (body: unknown) => {
  const path = parseBranchPath('body.branch_ids[]');
  if (path.kind === 'entity') throw new Error('not a list path');
  return branchIdsAt(path, { body, query: {}, params: {} });
};

describe('the access path body.branch_ids[]', () => {
  it('parses as a list whose elements are the ids', () => {
    expect(parseBranchPath('body.branch_ids[]')).toEqual({
      kind: 'list',
      source: 'body',
      list: 'branch_ids',
      field: '',
      optional: false,
    });
    expect(parseBranchPath('body.items[].branch_id')).toMatchObject({
      list: 'items',
      field: 'branch_id',
    });
  });

  it('names every id of the list', () => {
    expect(at({ branch_ids: ['a', 'b'] })).toEqual({ empty: false, ids: ['a', 'b'] });
  });

  it('an empty list names no branch, which only company scope covers', () => {
    expect(at({ branch_ids: [] })).toEqual({ empty: false, ids: [] });
  });

  it.each([{}, { branch_ids: 'a' }, { branch_ids: ['a', 3] }, { branch_ids: ['a', ''] }, null])(
    'a missing, malformed or incomplete list (%j) covers nothing',
    (body) => {
      expect(at(body)).toEqual({ empty: false, ids: [] });
    },
  );
});
