import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Testing Library unmounts after each test only when `afterEach` is a global; Vitest globals are off.
afterEach(cleanup);
