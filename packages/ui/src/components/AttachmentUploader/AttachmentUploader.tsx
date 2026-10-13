'use client';

import { cn } from 'cn';
import { CircleAlert, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from 'react';

import { errorMessageKey, ErrorCode, type UploadPurpose } from '@point/shared';

import { Button } from '../Button/Button';
import { DataText } from '../DataText/DataText';
import { acceptAttribute, isAllowedType, isWithinLimit, typeNames } from './accept';

// File attachments (AD-FORM-16 · API-LIM-03 · design D10): the allowed types and the size limit of the
// purpose as a hint; a file of another type or above `maxMb × 1,048,576` bytes is refused before any
// upload, with `error.file_type_not_allowed` / `error.file_too_large`. Files are dropped on the zone
// (desktop) or chosen with the file input — on a phone the system picker offers the camera and the
// gallery. Each upload shows a progress bar; while one runs the component reports busy (the form cannot
// be submitted). Uploaded files are listed with a thumbnail for images and a "Remove" button.

export interface UploadedFile {
  readonly attachment_id: string;
  readonly name: string;
  readonly preview_url?: string | null;
}

export interface UploadResult {
  readonly attachment_id: string;
  readonly preview_url?: string | null;
}

/** Uploads one file (P8.ATT.01) and reports progress from 0 to 1. A failure rejects with `{ code }`. */
export type UploadFunction = (
  file: File,
  onProgress: (fraction: number) => void,
) => Promise<UploadResult>;

export interface AttachmentUploaderProps {
  readonly purpose: UploadPurpose;
  /** The limit in MB (setting `system.upload_max_mb`). */
  readonly maxMb: number;
  readonly upload: UploadFunction;
  readonly value: readonly UploadedFile[];
  readonly multiple?: boolean;
  readonly onChange: (files: readonly UploadedFile[]) => void;
  readonly onBusyChange?: (busy: boolean) => void;
  readonly disabled?: boolean;
  readonly id?: string;
  readonly 'aria-label'?: string;
  readonly 'aria-invalid'?: true;
  readonly 'aria-describedby'?: string;
  readonly 'aria-required'?: true;
}

interface Running {
  readonly key: number;
  readonly name: string;
  readonly progress: number;
}

interface Refusal {
  readonly name: string;
  readonly code: string;
  readonly params?: Readonly<Record<string, string | number>>;
}

const percent = (fraction: number) => Math.round(Math.min(1, Math.max(0, fraction)) * 100);

export function AttachmentUploader(props: AttachmentUploaderProps) {
  const { purpose, maxMb, upload, value, multiple = false, onChange, onBusyChange } = props;
  const { disabled = false, 'aria-describedby': describedBy, ...control } = props;
  const t = useTranslations();
  const ownId = useId();
  const id = control.id ?? ownId;
  const hintId = `${id}-hint`;
  const messageId = `${id}-message`;
  const input = useRef<HTMLInputElement>(null);
  const [running, setRunning] = useState<readonly Running[]>([]);
  const [refusals, setRefusals] = useState<readonly Refusal[]>([]);
  const [dragging, setDragging] = useState(false);
  const nextKey = useRef(0);
  const mounted = useRef(true);
  // The files as last reported, so two uploads that end before a re-render both stay in the list.
  const latest = useRef(value);
  useLayoutEffect(() => {
    latest.current = value;
  }, [value]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const busy = running.length > 0;
  const reportedBusy = useRef(false);
  useEffect(() => {
    if (reportedBusy.current === busy) return;
    reportedBusy.current = busy;
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  const report = (files: readonly UploadedFile[]) => {
    latest.current = files;
    onChange(files);
  };

  const start = async (file: File) => {
    const key = nextKey.current++;
    setRunning((list) => [...list, { key, name: file.name, progress: 0 }]);
    try {
      const result = await upload(file, (fraction) => {
        if (!mounted.current) return;
        setRunning((list) =>
          list.map((item) => (item.key === key ? { ...item, progress: fraction } : item)),
        );
      });
      if (!mounted.current) return;
      const uploaded: UploadedFile = { ...result, name: file.name };
      report(multiple ? [...latest.current, uploaded] : [uploaded]);
    } catch (cause) {
      if (!mounted.current) return;
      const problem = (typeof cause === 'object' && cause !== null ? cause : {}) as {
        readonly code?: unknown;
        readonly params?: Readonly<Record<string, string | number>>;
      };
      setRefusals((list) => [
        ...list,
        {
          name: file.name,
          code: typeof problem.code === 'string' ? problem.code : 'unknown',
          // The limit and the types this component knows, for a message the server sent without them.
          params: { max_mb: maxMb, allowed: typeNames(purpose), ...problem.params },
        },
      ]);
    } finally {
      if (mounted.current) setRunning((list) => list.filter((item) => item.key !== key));
    }
  };

  const take = (files: readonly File[]) => {
    const chosen = multiple ? files : files.slice(0, 1);
    const refused: Refusal[] = [];
    const accepted: File[] = [];
    for (const file of chosen) {
      if (!isAllowedType(file, purpose)) {
        refused.push({
          name: file.name,
          code: ErrorCode.FILE_TYPE_NOT_ALLOWED,
          params: { allowed: typeNames(purpose) },
        });
      } else if (!isWithinLimit(file, maxMb)) {
        refused.push({
          name: file.name,
          code: ErrorCode.FILE_TOO_LARGE,
          params: { max_mb: maxMb },
        });
      } else accepted.push(file);
    }
    setRefusals(refused);
    for (const file of accepted) void start(file);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (!disabled) take([...event.dataTransfer.files]);
  };

  const described =
    [hintId, refusals.length > 0 ? messageId : null, describedBy].filter(Boolean).join(' ') ||
    undefined;
  const name =
    control['aria-label'] === undefined
      ? { 'aria-labelledby': `${id}-label` as const }
      : { 'aria-label': control['aria-label'] };

  let messages: ReactNode = null;
  if (refusals.length > 0) {
    messages = (
      <div id={messageId} role="alert" className="flex flex-col gap-1 text-sm text-destructive">
        {refusals.map((refusal, index) => (
          <p key={index} className="flex items-start gap-1.5">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span className="flex flex-wrap gap-x-2">
              <span className="font-semibold">
                <DataText>{refusal.name}</DataText>
              </span>
              <span>{t(errorMessageKey(refusal.code), refusal.params)}</span>
            </span>
          </p>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-slot="attachment-uploader">
      <div
        data-slot="drop-zone"
        data-dragging={dragging || undefined}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'rounded-lg border-2 border-dashed border-[var(--field-border)]',
          dragging && 'border-primary bg-muted',
        )}
      >
        <button
          type="button"
          id={id}
          {...name}
          aria-describedby={described}
          aria-invalid={control['aria-invalid']}
          aria-required={control['aria-required']}
          disabled={disabled}
          onClick={() => input.current?.click()}
          className="flex min-h-24 w-full flex-col items-center justify-center gap-2 p-4 text-sm text-muted-foreground"
        >
          <Upload aria-hidden className="size-6" />
          <span id={hintId}>
            {t('common.upload.hint', { types: typeNames(purpose), max_mb: maxMb })}
          </span>
        </button>
        <input
          ref={input}
          type="file"
          hidden
          tabIndex={-1}
          accept={acceptAttribute(purpose)}
          multiple={multiple}
          data-slot="file-input"
          onChange={(event) => {
            take([...(event.target.files ?? [])]);
            event.target.value = '';
          }}
        />
      </div>
      {messages}
      {busy ? (
        <div className="flex flex-col gap-2" data-slot="uploads-running">
          <p className="text-sm text-muted-foreground" role="status">
            {t('common.upload.inProgress')}
          </p>
          {running.map((item) => (
            <div key={item.key} className="flex flex-col gap-1">
              <span className="text-sm">
                <DataText>{item.name}</DataText>
              </span>
              <div
                role="progressbar"
                aria-label={item.name}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent(item.progress)}
                className="h-2 rounded-full bg-muted"
              >
                <div
                  className="h-2 rounded-full bg-primary"
                  style={{ width: `${percent(item.progress)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {value.length === 0 ? null : (
        <ul className="flex flex-col gap-2" data-slot="uploaded-files">
          {value.map((file) => (
            <UploadedRow
              key={file.attachment_id}
              file={file}
              disabled={disabled}
              onRemove={() =>
                report(latest.current.filter((item) => item.attachment_id !== file.attachment_id))
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function UploadedRow({
  file,
  disabled,
  onRemove,
}: {
  readonly file: UploadedFile;
  readonly disabled: boolean;
  readonly onRemove: () => void;
}) {
  const t = useTranslations('common.upload');
  const nameId = useId();
  return (
    <li className="flex items-center gap-3 rounded-md border border-border p-2">
      {file.preview_url ? (
        // Decorative: the file name next to it says what it is.
        <img src={file.preview_url} alt="" className="size-12 shrink-0 rounded object-cover" />
      ) : null}
      <span id={nameId} className="min-w-0 flex-1 text-sm break-words">
        <DataText>{file.name}</DataText>
      </span>
      <Button variant="ghost" aria-describedby={nameId} disabled={disabled} onClick={onRemove}>
        {t('remove')}
      </Button>
    </li>
  );
}
