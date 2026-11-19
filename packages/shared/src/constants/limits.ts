// Limits fixed in code that the API and the app both read (API-LIM-03 "fixed limits" · CG-ARCH-09):
// code, not a setting and not an environment variable.

/** Staff API requests one session may make in SESSION_REQUEST_WINDOW_SECONDS (API-LIM-03). */
export const SESSION_REQUEST_LIMIT = 600;
export const SESSION_REQUEST_WINDOW_SECONDS = 60;

/**
 * add-booking-cancel-reasons — the bound of every cancel-reason read (`take`, CG-PERF-02) and of a
 * reorder's `ids`; add-public-booking-modal's manage page reads the reasons with it too (its design D3).
 */
export const CANCEL_REASONS_MAX_ROWS = 100;
