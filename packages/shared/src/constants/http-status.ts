// The HTTP status codes of the API's answers that a client branches on (API-SHAPE-04 · API-ERR-02),
// with their RFC 9110 names. Not a database status: no STATUS_BY_TABLE entry, no language key. Named,
// so a `status` member is never compared with a bare number (CG-TS-04 · point/no-raw-status). Each
// change adds the codes its clients read.
export const HttpStatus = {
  NO_CONTENT: 204,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
} as const;
export type HttpStatus = (typeof HttpStatus)[keyof typeof HttpStatus];
