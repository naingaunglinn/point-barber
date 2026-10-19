Mounted as `/etc/caddy/conf.d` by `docker-compose.google.yml`: no `*.caddy` file here, so the
`http://localhost:3000` alias of `infra/caddy/dev/` is not loaded and the staff-host block of the
Caddyfile itself answers on that address (add-foundation-auth-access design D7).
