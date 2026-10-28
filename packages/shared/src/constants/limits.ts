// Limits fixed in code that the API and the app both read (API-LIM-03 "fixed limits" · CG-ARCH-09):
// code, not a setting and not an environment variable.

/** Staff API requests one session may make in SESSION_REQUEST_WINDOW_SECONDS (API-LIM-03). */
export const SESSION_REQUEST_LIMIT = 600;
export const SESSION_REQUEST_WINDOW_SECONDS = 60;
