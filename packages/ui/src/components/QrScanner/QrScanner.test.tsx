import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderIntl } from '../../test/intl';
import { cameraErrorKind } from './camera';
import { QrScanner, type QrScannerProps } from './QrScanner';

// ui-foundation "QrScanner reports one decoded text and explains a missing or refused camera"
// (AD-ATT-01 · AD-QA-03 · design D10). The camera is a stubbed getUserMedia (task 7.36).
const TOKEN_URL = 'https://app.point.test/clock?t=FIXTURE-TOKEN';
const HINT = 'Point the camera at the QR code';

function stubCamera(getUserMedia: ((constraints: MediaStreamConstraints) => unknown) | undefined) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: getUserMedia === undefined ? undefined : { getUserMedia: vi.fn(getUserMedia) },
  });
}

function renderScanner(props: Partial<QrScannerProps> = {}) {
  const handlers = { onResult: vi.fn(), onError: vi.fn(), onClose: vi.fn() };
  const view = renderIntl(<QrScanner source="camera" hint={HINT} {...handlers} {...props} />);
  return { ...handlers, view };
}

describe('QrScanner', () => {
  afterEach(() => {
    stubCamera(undefined);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('Scenario: Mock scan — the result handler is called once with exactly that text; the hint is shown', () => {
    const { onResult, view } = renderScanner({ source: { mock: TOKEN_URL } });
    view.rerender(
      <QrScanner source={{ mock: TOKEN_URL }} hint={HINT} onResult={onResult} onClose={vi.fn()} />,
    );
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith(TOKEN_URL);
    expect(screen.getByRole('dialog', { name: HINT })).toBeDefined();
    expect(document.querySelector('[data-slot="qr-frame"]')).not.toBeNull();
  });

  it('Scenario: Camera permission denied — common.qr.permissionDenied with a close button, no error thrown', async () => {
    stubCamera(() => Promise.reject(new DOMException('denied', 'NotAllowedError')));
    const { onError, onClose } = renderScanner();
    expect(
      await screen.findByText(
        'Camera access is off. Allow the camera for this site in the browser settings, then try again.',
      ),
    ).toBeDefined();
    expect(onError).toHaveBeenCalledWith('permission_denied');
    const closes = screen.getAllByRole('button', { name: 'Close' });
    fireEvent.click(closes[closes.length - 1] as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Scenario: No camera — common.qr.noCamera with a close button, no error thrown', async () => {
    stubCamera(() => Promise.reject(new DOMException('none', 'NotFoundError')));
    const { onError } = renderScanner();
    expect(await screen.findByText('No camera was found on this device.')).toBeDefined();
    expect(onError).toHaveBeenCalledWith('no_camera');
  });

  it('a browser without the camera API counts as no camera', async () => {
    stubCamera(undefined);
    renderScanner();
    expect(await screen.findByText('No camera was found on this device.')).toBeDefined();
  });

  it('the camera source reads frames until a QR code is found, reports it once and stops the camera', async () => {
    const stop = vi.fn();
    stubCamera(() => Promise.resolve({ getTracks: () => [{ stop }] }));
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const detect = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ rawValue: TOKEN_URL }]);
    vi.stubGlobal(
      'BarcodeDetector',
      Object.assign(
        vi.fn(function () {
          return { detect };
        }),
        { getSupportedFormats: () => Promise.resolve(['qr_code']) },
      ),
    );
    const { onResult } = renderScanner();
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(TOKEN_URL));
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(detect).toHaveBeenCalledTimes(2);
    expect(stop).toHaveBeenCalled();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: 'environment' },
      audio: false,
    });
  });

  it('maps the camera errors of design D10', () => {
    const kind = (name: string) => cameraErrorKind(new DOMException('x', name));
    expect(kind('NotAllowedError')).toBe('permission_denied');
    expect(kind('NotFoundError')).toBe('no_camera');
    expect(kind('OverconstrainedError')).toBe('no_camera');
    expect(kind('NotReadableError')).toBe('unreadable');
  });
});
