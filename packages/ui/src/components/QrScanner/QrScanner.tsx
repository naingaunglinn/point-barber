'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useEffectEvent, useRef, useState } from 'react';

import { Dialog as DialogRoot, DialogContent, DialogTitle } from '../../primitives/dialog';
import { Button } from '../Button/Button';
import { useReturnFocus } from '../Dialog/Dialog';
import { useDialogOverDrawer } from '../Dialog/overlay-stack';
import { cameraErrorKind, createQrDetector, type QrErrorKind } from './camera';

// The QR scanner (AD-ATT-01 · AD-QA-03 · design D10): full screen, a frame and the caller's hint, a
// close button; the decoded text is reported once. The camera source asks for the back camera and
// reads frames until a QR code is found; a refused or missing camera shows an explanation with the
// close button instead of failing. The mock source reports its text without a camera (automated tests).

export type QrSource = 'camera' | { readonly mock: string };

export interface QrScannerProps {
  readonly source: QrSource;
  /** Translated ("Point the camera at the QR code"). */
  readonly hint: string;
  readonly onResult: (text: string) => void;
  readonly onError?: (kind: QrErrorKind) => void;
  readonly onClose: () => void;
}

/** Time between two frames read by the detector. */
const SCAN_INTERVAL_MS = 200;

const stopTracks = (stream: MediaStream | null) => {
  for (const track of stream?.getTracks() ?? []) track.stop();
};

export function QrScanner({ source, hint, onResult, onError, onClose }: QrScannerProps) {
  const t = useTranslations();
  const [error, setError] = useState<QrErrorKind | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const reported = useRef(false);
  useDialogOverDrawer(true);
  const returnFocus = useReturnFocus(true);

  const report = useEffectEvent((text: string) => {
    if (reported.current) return;
    reported.current = true;
    onResult(text);
  });
  const fail = useEffectEvent((kind: QrErrorKind) => {
    setError(kind);
    onError?.(kind);
  });

  const mock = typeof source === 'object' ? source.mock : null;
  useEffect(() => {
    if (mock !== null) report(mock);
  }, [mock]);

  useEffect(() => {
    if (source !== 'camera') return;
    let active = true;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const media = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
    if (media?.getUserMedia === undefined) {
      fail('no_camera');
      return;
    }
    const scan = async () => {
      try {
        stream = await media.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      } catch (cause) {
        if (active) fail(cameraErrorKind(cause));
        return;
      }
      const element = video.current;
      if (!active || element === null) return stopTracks(stream);
      try {
        element.srcObject = stream;
        await element.play();
        const detector = await createQrDetector();
        const tick = async () => {
          if (!active) return;
          const [code] = await detector.detect(element);
          if (code !== undefined && code.rawValue !== '') {
            stopTracks(stream);
            report(code.rawValue);
          } else timer = setTimeout(() => void tick().catch(stop), SCAN_INTERVAL_MS);
        };
        await tick();
      } catch (cause) {
        stop(cause);
      }
    };
    const stop = (cause: unknown) => {
      stopTracks(stream);
      if (active) fail(cameraErrorKind(cause));
    };
    void scan();
    return () => {
      active = false;
      clearTimeout(timer);
      stopTracks(stream);
    };
  }, [source]);

  const message =
    error === null
      ? null
      : error === 'permission_denied'
        ? t('common.qr.permissionDenied')
        : error === 'no_camera'
          ? t('common.qr.noCamera')
          : t('error.unknown');

  return (
    <DialogRoot open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        showCloseButton={false}
        onCloseAutoFocus={returnFocus}
        aria-describedby={undefined}
        className="inset-0 top-0 left-0 flex h-dvh max-h-none w-screen max-w-none translate-x-0 translate-y-0 flex-col items-center justify-center gap-6 rounded-none bg-foreground p-4 text-background ring-0 sm:max-w-none"
        data-slot="qr-scanner"
      >
        <div className="absolute end-2 top-2">
          <Button
            variant="ghost"
            iconOnly
            icon={<X />}
            aria-label={t('common.action.close')}
            onClick={onClose}
          />
        </div>
        {message === null ? (
          <>
            <div
              className="relative aspect-square w-full max-w-72 overflow-hidden rounded-lg border-4 border-background"
              data-slot="qr-frame"
            >
              {source === 'camera' ? (
                <video
                  ref={video}
                  muted
                  playsInline
                  aria-hidden
                  className="size-full object-cover"
                />
              ) : null}
            </div>
            <DialogTitle className="text-center text-base font-semibold">{hint}</DialogTitle>
          </>
        ) : (
          <div role="alert" className="flex max-w-sm flex-col items-center gap-4 text-center">
            <DialogTitle className="text-base font-semibold">{message}</DialogTitle>
            <Button variant="primary" onClick={onClose}>
              {t('common.action.close')}
            </Button>
          </div>
        )}
      </DialogContent>
    </DialogRoot>
  );
}
