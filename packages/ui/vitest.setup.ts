import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Testing Library unmounts after each test only when `afterEach` is a global; Vitest globals are off.
afterEach(cleanup);

// Browser APIs that jsdom lacks and the searchable list (cmdk) calls.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver ??= ResizeObserverStub;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
