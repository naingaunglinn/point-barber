import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderIntl } from '../../test/intl';
import { DemoTitleProvider } from '../demo-title';
import { UnsavedChangesDemo } from './unsaved-demos';

// The catalogue demo of the guard (add-unsaved-changes-guard task 1.9): its link asks only while the field
// holds text.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

const TITLE = 'Unsaved';

describe('UnsavedChangesDemo', () => {
  it('the link asks "Discard changes?" while the field holds text, and not when it is empty', async () => {
    renderIntl(
      <DemoTitleProvider value="demo-title">
        <h4 id="demo-title">{TITLE}</h4>
        <UnsavedChangesDemo />
      </DemoTitleProvider>,
    );
    const stop = (event: Event) => event.preventDefault();
    document.addEventListener('click', stop);
    const link = screen.getByRole('link', { name: 'Leave this page' });
    fireEvent.click(link);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'x' } });
    fireEvent.click(link);
    expect(await screen.findByRole('alertdialog', { name: 'Discard changes?' })).toBeTruthy();
    document.removeEventListener('click', stop);
  });
});
