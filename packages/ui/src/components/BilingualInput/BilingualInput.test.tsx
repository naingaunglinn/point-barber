import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { renderIntl } from '../../test/intl';
import { TextInput } from '../TextInput/TextInput';
import { BilingualInput, type Bilingual } from './BilingualInput';

// ui-foundation "Master names are entered as a Myanmar and English pair" and "Zawgyi text typed into
// shared text inputs is converted to Unicode" (D-DB-04 · AD-FORM-09 · AD-FORM-13 · AD-L10N-07 · design D10).
const ZAWGYI = 'ျမန္မာ'; // "Myanmar" typed in Zawgyi
const UNICODE = 'မြန်မာ'; // the same word in Unicode
const HAIRCUT_MM = 'ဆံပင်ညှပ်';
const HAIRCUT_EN = 'Haircut';
const NOTE = 'Note';

function Pair({ onValue }: { onValue?: (value: Bilingual) => void }) {
  const [value, setValue] = useState<Bilingual>({ mm: '', en: null });
  return (
    <>
      <BilingualInput
        value={value}
        onChange={(next) => {
          setValue(next);
          onValue?.(next);
        }}
      />
      <button type="button">{NOTE}</button>
    </>
  );
}

const mm = () => screen.getByRole('textbox', { name: /Myanmar/ }) as HTMLInputElement;
const en = () => screen.getByRole('textbox', { name: 'English' }) as HTMLInputElement;
const outside = () => screen.getByRole('button', { name: NOTE });

describe('BilingualInput', () => {
  it('stacks Myanmar (required, first) over English, with the hint', () => {
    renderIntl(<Pair />);
    expect(mm().compareDocumentPosition(en()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(mm().getAttribute('aria-required')).toBe('true');
    expect(mm().getAttribute('lang')).toBe('my');
    expect(screen.getByText('Leave English empty to show the Myanmar text')).toBeDefined();
  });

  it('Scenario: Myanmar only — { mm: "ဆံပင်ညှပ်", en: null } and no error', () => {
    const onValue = vi.fn();
    renderIntl(<Pair onValue={onValue} />);
    fireEvent.change(mm(), { target: { value: HAIRCUT_MM } });
    fireEvent.blur(mm(), { relatedTarget: outside() });
    expect(onValue).toHaveBeenLastCalledWith({ mm: HAIRCUT_MM, en: null });
    expect(screen.queryByText('This field is required.')).toBeNull();
  });

  it('reports an emptied English value as null', () => {
    const onValue = vi.fn();
    renderIntl(<Pair onValue={onValue} />);
    fireEvent.change(en(), { target: { value: HAIRCUT_EN } });
    expect(onValue).toHaveBeenLastCalledWith({ mm: '', en: HAIRCUT_EN });
    fireEvent.change(en(), { target: { value: '  ' } });
    expect(onValue).toHaveBeenLastCalledWith({ mm: '', en: null });
  });

  it('Scenario: Myanmar name missing — error.required under the Myanmar input after leaving the pair', () => {
    renderIntl(<Pair />);
    fireEvent.change(en(), { target: { value: HAIRCUT_EN } });
    fireEvent.blur(en(), { relatedTarget: mm() }); // moving inside the pair is not leaving it
    expect(screen.queryByText('This field is required.')).toBeNull();
    fireEvent.blur(mm(), { relatedTarget: outside() });
    const message = screen.getByText('This field is required.');
    expect(mm().getAttribute('aria-invalid')).toBe('true');
    expect(mm().getAttribute('aria-describedby')).toContain(message.id);
    expect(message.compareDocumentPosition(en()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.change(mm(), { target: { value: HAIRCUT_MM } });
    expect(screen.queryByText('This field is required.')).toBeNull();
  });

  it('Scenario: Zawgyi input — the field shows မြန်မာ, the value is Unicode, the notice is shown', () => {
    const onValue = vi.fn();
    renderIntl(<Pair onValue={onValue} />);
    fireEvent.change(mm(), { target: { value: ZAWGYI } });
    fireEvent.blur(mm(), { relatedTarget: outside() });
    expect(mm().value).toBe(UNICODE);
    expect(onValue).toHaveBeenLastCalledWith({ mm: UNICODE, en: null });
    expect(
      screen.getByText('Converted from Zawgyi to Unicode. Please check the text.'),
    ).toBeDefined();
  });

  it('Scenario: Unicode input is untouched — no notice', () => {
    const onValue = vi.fn();
    renderIntl(<Pair onValue={onValue} />);
    fireEvent.change(mm(), { target: { value: UNICODE } });
    fireEvent.blur(mm(), { relatedTarget: outside() });
    expect(onValue).toHaveBeenLastCalledWith({ mm: UNICODE, en: null });
    expect(document.querySelector('[data-slot="zawgyi-notice"]')).toBeNull();
  });
});

describe('TextInput', () => {
  it('converts Zawgyi in a multi-line note too, and the notice goes away when the user types again', () => {
    function Note() {
      const [value, setValue] = useState('');
      return <TextInput aria-label={NOTE} multiline value={value} onChange={setValue} />;
    }
    renderIntl(<Note />);
    const note = screen.getByRole('textbox', { name: NOTE }) as HTMLTextAreaElement;
    fireEvent.change(note, { target: { value: ZAWGYI } });
    fireEvent.blur(note);
    expect(note.value).toBe(UNICODE);
    expect(document.querySelector('[data-slot="zawgyi-notice"]')).not.toBeNull();
    fireEvent.change(note, { target: { value: `${UNICODE} ` } });
    expect(document.querySelector('[data-slot="zawgyi-notice"]')).toBeNull();
  });
});
