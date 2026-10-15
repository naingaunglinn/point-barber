import { act, fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { UploadPurpose } from '@point/shared';

import { renderIntl } from '../../test/intl';
import { Button } from '../Button/Button';
import { FormField } from '../FormField/FormField';
import { acceptAttribute, isAllowedType, isWithinLimit } from './accept';
import {
  AttachmentUploader,
  type UploadedFile,
  type UploadFunction,
  type UploadResult,
} from './AttachmentUploader';

// ui-foundation "AttachmentUploader checks type and size before uploading and reports that it is busy"
// (AD-FORM-16 · API-LIM-03 · design D10). The upload function is a fake (no request).
const LIMIT = 10 * 1_048_576; // 10,485,760
const SAVE = 'Save';

function fileOf(name: string, type: string, size: number): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

/** An upload the test finishes by hand, reporting progress through `progress`. */
function manualUpload() {
  let finish: (result: UploadResult) => void = () => undefined;
  let progress: (fraction: number) => void = () => undefined;
  const upload = vi.fn<UploadFunction>(
    (_file, onProgress) =>
      new Promise((resolve) => {
        finish = resolve;
        progress = onProgress;
      }),
  );
  return { upload, finish: (r: UploadResult) => finish(r), progress: (f: number) => progress(f) };
}

function Demo({
  upload,
  purpose = 'image',
  multiple = false,
  onFiles,
}: {
  upload: UploadFunction;
  purpose?: UploadPurpose;
  multiple?: boolean;
  onFiles?: (files: readonly UploadedFile[]) => void;
}) {
  const [files, setFiles] = useState<readonly UploadedFile[]>([]);
  const [busy, setBusy] = useState(false);
  return (
    <form onSubmit={(event) => event.preventDefault()}>
      <FormField label="Photo">
        {(control) => (
          <AttachmentUploader
            {...control}
            purpose={purpose}
            maxMb={10}
            upload={upload}
            value={files}
            multiple={multiple}
            onChange={(next) => {
              setFiles(next);
              onFiles?.(next);
            }}
            onBusyChange={setBusy}
          />
        )}
      </FormField>
      <Button type="submit" variant="primary" disabled={busy}>
        {SAVE}
      </Button>
    </form>
  );
}

const choose = (...files: File[]) =>
  fireEvent.change(document.querySelector('[data-slot="file-input"]') as HTMLInputElement, {
    target: { files },
  });

describe('AttachmentUploader', () => {
  it('shows the allowed types and the limit of the purpose', () => {
    renderIntl(<Demo upload={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Photo' }).textContent).toBe(
      'JPEG, PNG, WebP, HEIC · up to 10 MB',
    );
    expect(acceptAttribute('document')).toContain('application/pdf');
    expect(acceptAttribute('import')).toBe(
      'text/csv,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx',
    );
  });

  it('Scenario: Upload size boundary — 10,485,760 bytes uploads with a progress bar; 10,485,761 is refused', async () => {
    const { upload, finish, progress } = manualUpload();
    renderIntl(<Demo upload={upload} />);
    choose(fileOf('exact.jpg', 'image/jpeg', LIMIT));
    expect(upload).toHaveBeenCalledTimes(1);
    act(() => progress(0.4));
    expect(
      screen.getByRole('progressbar', { name: 'exact.jpg' }).getAttribute('aria-valuenow'),
    ).toBe('40');
    await act(async () => finish({ attachment_id: 'a1' }));
    choose(fileOf('over.jpg', 'image/jpeg', LIMIT + 1));
    expect(screen.getByRole('alert').textContent).toContain('The file is larger than 10 MB.');
    expect(upload).toHaveBeenCalledTimes(1);
    expect(isWithinLimit({ size: LIMIT }, 10)).toBe(true);
    expect(isWithinLimit({ size: LIMIT + 1 }, 10)).toBe(false);
  });

  it('Scenario: Wrong type and busy state — PDF refused for image; submit disabled while a JPEG uploads', async () => {
    const { upload, finish } = manualUpload();
    renderIntl(<Demo upload={upload} />);
    choose(fileOf('scan.pdf', 'application/pdf', 1000));
    expect(screen.getByRole('alert').textContent).toContain(
      'This file type is not allowed. Allowed: JPEG, PNG, WebP, HEIC.',
    );
    expect(upload).not.toHaveBeenCalled();
    const submit = screen.getByRole('button', { name: SAVE }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
    choose(fileOf('photo.jpeg', 'image/jpeg', 2000));
    expect(submit.disabled).toBe(true);
    expect(screen.getByText('Uploading… wait until it finishes.')).toBeDefined();
    await act(async () => finish({ attachment_id: 'a1' }));
    expect(submit.disabled).toBe(false);
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('an invalid field marks the zone and describes the button; the button itself takes no aria-invalid', () => {
    renderIntl(
      <FormField label="Photo" error={{ code: 'required' }}>
        {(control) => (
          <AttachmentUploader
            {...control}
            purpose="image"
            maxMb={10}
            upload={vi.fn()}
            value={[]}
            onChange={vi.fn()}
          />
        )}
      </FormField>,
    );
    const button = screen.getByRole('button', { name: 'Photo' });
    expect(button.hasAttribute('aria-invalid')).toBe(false);
    expect(button.getAttribute('aria-describedby')).toContain('-error');
    expect(document.querySelector('[data-slot="drop-zone"]')?.className).toContain(
      'border-destructive',
    );
  });

  it('accepts a file by its extension or its reported type', () => {
    expect(isAllowedType({ name: 'IMG_0001.HEIC', type: '' }, 'image')).toBe(true);
    expect(isAllowedType({ name: 'list.csv', type: 'application/vnd.ms-excel' }, 'import')).toBe(
      true,
    );
    expect(isAllowedType({ name: 'scan.pdf', type: 'application/pdf' }, 'document')).toBe(true);
    expect(isAllowedType({ name: 'scan.pdf', type: 'application/pdf' }, 'image')).toBe(false);
  });

  it('a dropped file is uploaded; an uploaded file is listed with its thumbnail and can be removed', async () => {
    const onFiles = vi.fn();
    const upload = vi.fn<UploadFunction>(() =>
      Promise.resolve({ attachment_id: 'a1', preview_url: '/preview/a1.webp' }),
    );
    renderIntl(<Demo upload={upload} onFiles={onFiles} />);
    const zone = document.querySelector('[data-slot="drop-zone"]') as HTMLElement;
    fireEvent.dragOver(zone);
    expect(zone.getAttribute('data-dragging')).toBe('true');
    await act(async () => {
      fireEvent.drop(zone, { dataTransfer: { files: [fileOf('cut.png', 'image/png', 500)] } });
    });
    expect(onFiles).toHaveBeenLastCalledWith([
      { attachment_id: 'a1', preview_url: '/preview/a1.webp', name: 'cut.png' },
    ]);
    expect(document.querySelector('[data-slot="uploaded-files"] img')?.getAttribute('src')).toBe(
      '/preview/a1.webp',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove', description: 'cut.png' }));
    expect(onFiles).toHaveBeenLastCalledWith([]);
  });

  it('with `multiple`, two uploads that end together are both kept', async () => {
    const onFiles = vi.fn();
    const upload = vi.fn<UploadFunction>((file) => Promise.resolve({ attachment_id: file.name }));
    renderIntl(<Demo upload={upload} onFiles={onFiles} multiple purpose="document" />);
    await act(async () => {
      choose(fileOf('a.pdf', 'application/pdf', 10), fileOf('b.jpg', 'image/jpeg', 10));
    });
    expect(onFiles).toHaveBeenLastCalledWith([
      { attachment_id: 'a.pdf', name: 'a.pdf' },
      { attachment_id: 'b.jpg', name: 'b.jpg' },
    ]);
  });

  it('a failed upload shows the message of its code', async () => {
    const upload = vi.fn<UploadFunction>(() => Promise.reject({ code: 'file_too_large' }));
    renderIntl(<Demo upload={upload} />);
    await act(async () => {
      choose(fileOf('big.jpg', 'image/jpeg', 10));
    });
    expect(screen.getByRole('alert').textContent).toContain('The file is larger than');
  });
});
