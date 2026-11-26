// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { renderStaff } from '../../test/render';
import { ReorderList } from './ReorderList';

// add-service-catalogue design D11 / "Shared pieces" (task 7.3, the reorder list only) · AD-SET-04 ·
// AD-A11Y-02 · AD-VIS-07: a drag handle on pointer devices plus Move up / Move down for keyboard and
// touch, and "Save order" — shown only once the order differs from the one received — which sends the whole
// id list. Rows are the fixture Services of spec-fixtures.md §8: Haircut, Shave, Hair wash.
interface Row {
  readonly id: string;
  readonly name: string;
}
const HAIRCUT = { id: 'svc-haircut', name: 'Haircut' };
const SHAVE = { id: 'svc-shave', name: 'Shave' };
const HAIR_WASH = { id: 'svc-hair-wash', name: 'Hair wash' };
const ROWS: readonly Row[] = [HAIRCUT, SHAVE, HAIR_WASH];

function renderList(
  props: Partial<Parameters<typeof ReorderList<Row>>[0]> = {},
  locale: 'en' | 'my' = 'en',
) {
  const onSave = vi.fn();
  const view = renderStaff(
    <ReorderList<Row>
      label="Services"
      items={ROWS}
      getId={(row) => row.id}
      renderItem={(row) => <span>{row.name}</span>}
      onSave={onSave}
      {...props}
    />,
    { locale },
  );
  return { onSave, ...view };
}

const names = () =>
  within(screen.getByRole('list', { name: 'Services' }))
    .getAllByRole('listitem')
    .map((item) => within(item).getByText(/Haircut|Shave|Hair wash/).textContent);
const button = (name: string, label: RegExp | string) =>
  within(row(name)).getByRole('button', { name: label }) as HTMLButtonElement;
const row = (name: string) => screen.getByText(name).closest('li') as HTMLElement;
const moveDown = (name: string) => fireEvent.click(button(name, /Move down/));
const moveUp = (name: string) => fireEvent.click(button(name, /Move up/));
const save = () => screen.getByRole('button', { name: 'Save order' }) as HTMLButtonElement;

describe('ReorderList', () => {
  it('Scenario: the rows show in the order received, with no Save order yet', () => {
    renderList();
    expect(names()).toEqual(['Haircut', 'Shave', 'Hair wash']);
    expect(screen.queryByRole('button', { name: 'Save order' })).toBeNull();
  });

  it('Scenario: Move down and Move up change the order from the keyboard', () => {
    renderList();
    moveDown('Haircut');
    expect(names()).toEqual(['Shave', 'Haircut', 'Hair wash']);
    moveUp('Hair wash');
    expect(names()).toEqual(['Shave', 'Hair wash', 'Haircut']);
  });

  it('Scenario: the first row cannot move up and the last cannot move down', () => {
    renderList();
    expect(button('Haircut', /Move up/).disabled).toBe(true);
    expect(button('Hair wash', /Move down/).disabled).toBe(true);
    expect(button('Shave', /Move up/).disabled).toBe(false);
    expect(button('Shave', /Move down/).disabled).toBe(false);
  });

  it('Scenario: the button names its row, so a screen reader hears which row moves', () => {
    renderList();
    const id = button('Shave', /Move up/).getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(id)?.textContent).toBe('Shave');
  });

  it('Scenario: the moved row keeps the keyboard focus on the same button', () => {
    renderList();
    button('Haircut', /Move down/).focus();
    moveDown('Haircut');
    expect(document.activeElement).toBe(button('Haircut', /Move down/));
  });

  it('Scenario: a row that reaches the end passes the focus to its other button', () => {
    renderList();
    moveDown('Haircut');
    moveDown('Haircut');
    expect(document.activeElement).toBe(button('Haircut', /Move up/));
  });

  it('Scenario: Save order appears after a move and sends every id in the new order', () => {
    const { onSave } = renderList();
    moveDown('Haircut');
    fireEvent.click(save());
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith([SHAVE.id, HAIRCUT.id, HAIR_WASH.id]);
  });

  it('Scenario: moving a row back to where it started hides Save order again', () => {
    renderList();
    moveDown('Haircut');
    expect(save().disabled).toBe(false);
    moveUp('Haircut');
    expect(screen.queryByRole('button', { name: 'Save order' })).toBeNull();
  });

  it('Scenario: while the save runs the button keeps its label and cannot be pressed twice', () => {
    const { onSave, rerender } = renderList();
    moveDown('Haircut');
    rerender(
      <ReorderList<Row>
        label="Services"
        items={ROWS}
        getId={(item) => item.id}
        renderItem={(item) => <span>{item.name}</span>}
        onSave={onSave}
        saving
      />,
    );
    expect(save().disabled).toBe(true);
    fireEvent.click(save());
    expect(onSave).not.toHaveBeenCalled();
  });

  it('Scenario: new items from a refetch replace the moved order', () => {
    const { rerender } = renderList();
    moveDown('Haircut');
    rerender(
      <ReorderList<Row>
        label="Services"
        items={[HAIR_WASH, HAIRCUT, SHAVE]}
        getId={(item) => item.id}
        renderItem={(item) => <span>{item.name}</span>}
        onSave={vi.fn()}
      />,
    );
    expect(names()).toEqual(['Hair wash', 'Haircut', 'Shave']);
    expect(screen.queryByRole('button', { name: 'Save order' })).toBeNull();
  });

  it('Scenario: a rerender with the same items keeps the order the person is arranging', () => {
    const { rerender } = renderList();
    moveDown('Haircut');
    rerender(
      <ReorderList<Row>
        label="Services"
        items={[...ROWS]}
        getId={(item) => item.id}
        renderItem={(item) => <span>{item.name}</span>}
        onSave={vi.fn()}
      />,
    );
    expect(names()).toEqual(['Shave', 'Haircut', 'Hair wash']);
    expect(save().disabled).toBe(false);
  });

  it('Scenario: read-only — no handle, no move buttons and no Save order', () => {
    renderList({ readOnly: true });
    expect(names()).toEqual(['Haircut', 'Shave', 'Hair wash']);
    expect(screen.queryByRole('button')).toBeNull();
    expect(document.querySelector('[draggable="true"]')).toBeNull();
  });

  it('Scenario: dragging a row onto another moves it there', () => {
    const { onSave } = renderList();
    const handle = within(row('Haircut')).getByTestId('reorder-handle');
    // jsdom has no DataTransfer; the list only sets its data and effect.
    fireEvent.dragStart(handle, { dataTransfer: { setData: vi.fn(), effectAllowed: '' } });
    fireEvent.dragOver(row('Hair wash'));
    fireEvent.drop(row('Hair wash'));
    expect(names()).toEqual(['Shave', 'Hair wash', 'Haircut']);
    fireEvent.click(save());
    expect(onSave).toHaveBeenCalledWith([SHAVE.id, HAIR_WASH.id, HAIRCUT.id]);
  });

  it('Scenario: the buttons and Save order read in Myanmar when the language is Myanmar', () => {
    renderList({}, 'my');
    fireEvent.click(button('Haircut', 'အောက်သို့ ရွှေ့မည်'));
    expect(screen.getByRole('button', { name: 'အစဉ်ကို သိမ်းမည်' })).toBeTruthy();
    expect(button('Shave', 'အပေါ်သို့ ရွှေ့မည်')).toBeTruthy();
  });
});
