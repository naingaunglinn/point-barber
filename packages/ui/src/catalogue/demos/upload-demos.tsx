'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { UploadPurpose } from '@point/shared';

import {
  AttachmentUploader,
  type UploadedFile,
  type UploadFunction,
} from '../../components/AttachmentUploader/AttachmentUploader';
import { Button } from '../../components/Button/Button';
import { FormField } from '../../components/FormField/FormField';
import { HandlerLog } from '../demo-frame';

// AttachmentUploader demos (task 9.3 · AD-FORM-16 · API-LIM-03): a fake upload that reports progress
// for about two seconds and never sends the file; the demo form's "Save" is disabled while it runs.

const STEPS = 10;
const STEP_MS = 200;

let uploads = 0;

const fakeUpload: UploadFunction = (file, onProgress) =>
  new Promise((resolve) => {
    uploads += 1;
    const id = `att-${uploads}`;
    let step = 0;
    const tick = () => {
      step += 1;
      onProgress(step / STEPS);
      if (step < STEPS) {
        setTimeout(tick, STEP_MS);
        return;
      }
      resolve({
        attachment_id: id,
        preview_url: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      });
    };
    setTimeout(tick, STEP_MS);
  });

function UploaderDemo({
  purpose,
  label,
  multiple = false,
}: {
  readonly purpose: UploadPurpose;
  readonly label: 'photo' | 'documents' | 'importFile';
  readonly multiple?: boolean;
}) {
  const t = useTranslations('devui.upload');
  const log = useTranslations('devui.log');
  const [files, setFiles] = useState<readonly UploadedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState('');
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        setSaved(log('saved', { count: files.length }));
      }}
    >
      <FormField label={t(label)}>
        {(control) => (
          <AttachmentUploader
            {...control}
            purpose={purpose}
            maxMb={10}
            upload={fakeUpload}
            value={files}
            multiple={multiple}
            onChange={setFiles}
            onBusyChange={setBusy}
          />
        )}
      </FormField>
      <div>
        <Button type="submit" variant="primary" disabled={busy}>
          {t('save')}
        </Button>
      </div>
      <HandlerLog label={log('label')} value={saved} />
    </form>
  );
}

export const UploadImageDemo = () => <UploaderDemo purpose="image" label="photo" />;
export const UploadDocumentDemo = () => (
  <UploaderDemo purpose="document" label="documents" multiple />
);
export const UploadImportDemo = () => <UploaderDemo purpose="import" label="importFile" />;
