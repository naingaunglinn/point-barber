import { afterEach } from 'vitest';

// Component tests of the web app run in jsdom (`// @vitest-environment jsdom` at the top of the file); the
// other tests stay in node. Testing Library unmounts after each test only when `afterEach` is a global —
// Vitest globals are off — so the cleanup is registered here, where a DOM exists.
if (typeof document !== 'undefined') {
  const { cleanup } = await import('@testing-library/react');
  afterEach(cleanup);
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver ??= ResizeObserverStub;
  Element.prototype.scrollIntoView ??= function scrollIntoView() {};
}
