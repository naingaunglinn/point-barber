import type { NextFunction, Request, Response } from 'express';

import type { Clock } from '../clock/clock.js';
import { clientIp } from './client-ip.js';
import { RequestContext } from './request-context.js';
import { isUuid, uuidV7 } from './uuid-v7.js';

export const REQUEST_ID_HEADER = 'X-Request-Id';

// Runs before everything else (design D6 · API-ERR-01 · API-AUD-02): a client X-Request-Id is used
// (lower-cased) only when it is a UUID; otherwise the server makes a UUIDv7. The id goes on the
// response at once, so 404s and errors carry it too, and into the request context — with the client
// facts the session and audit rows record (add-foundation-auth-access D1 · D5): the address the
// trusted proxy saw, the User-Agent and X-Client.
export function requestIdMiddleware(clock: Clock, trustedProxyHops: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const sent = req.header(REQUEST_ID_HEADER);
    const requestId =
      sent !== undefined && isUuid(sent) ? sent.toLowerCase() : uuidV7(clock.now().getTime());
    res.setHeader(REQUEST_ID_HEADER, requestId);
    RequestContext.run(
      {
        request_id: requestId,
        ip: clientIp(req.socket.remoteAddress, req.header('X-Forwarded-For'), trustedProxyHops),
        user_agent: req.header('User-Agent'),
        client: req.header('X-Client'),
      },
      next,
    );
  };
}
