// The client's address (add-foundation-auth-access design D5 · ADR-009): each trusted proxy in front
// of the API (Caddy — TRUSTED_PROXY_HOPS = 1) appends the address it saw to X-Forwarded-For, so the
// client is the entry `trustedHops` places from the right of [header entries…, socket address]. An
// entry the client wrote itself sits further left and is never read. The rate-limit key and the
// audit `ip` come from here.
export function clientIp(
  socketAddress: string | undefined,
  forwardedFor: string | undefined,
  trustedHops: number,
): string | undefined {
  const forwarded = (forwardedFor ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  // Nearest first: the socket peer, then the header from right to left.
  const chain = [socketAddress, ...forwarded.reverse()];
  const address = chain[Math.min(trustedHops, chain.length - 1)];
  return address?.startsWith('::ffff:') === true ? address.slice('::ffff:'.length) : address;
}
