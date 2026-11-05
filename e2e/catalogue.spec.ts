import { expect, test } from './fixtures.js';

// The component catalogue is never in the production image (add-shared-ui-components task 11.25 ·
// design D12 · AD-IMPL-06): the stack of this job is built from the production Dockerfiles, whose
// build does not set the catalogue flag. The catalogue itself is tested by e2e/dev-ui/.

test.describe('add-shared-ui-components · ui-foundation · The catalogue `/dev/ui` exists only outside the production image', () => {
  test('Scenario: Not in production', async ({ app }) => {
    const res = await app.get('/dev/ui');
    expect(res.status()).toBe(404);
  });
});
