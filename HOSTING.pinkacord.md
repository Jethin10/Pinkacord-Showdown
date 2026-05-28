# Pinkacord — Hosting & Deployment

This document is the operator's manual. It covers running Pinkacord locally,
in a container, and on Fly.io (the recommended free-credit-friendly host).
Backup, scaling, and the production hardening checklist are at the bottom.


## TL;DR

```sh
# 1. Set the admin password
cp .env.example .env
# Edit .env, set PINKACORD_ADMIN_PASSWORD to a strong value

# 2. (Optional but recommended) Configure the hotpatch bot account
#    See "Bot account setup" below

# 3. Run it
npm run start:all
#  → PS server      http://localhost:8000/
#  → Admin panel    http://localhost:8001/
```

That's the whole local-dev story.


## Topology recap

One Node process (`tools/launcher.js`) supervises two children:

```
   tools/launcher.js  (PID 1 inside the container)
       │
       ├── node pokemon-showdown       :8000   ← players connect here
       │                                         (also serves the client when co-hosted)
       │
       └── dist/tools/pinkacord-admin/server.js  :8001   ← admins use this
```

`launcher.js` forwards SIGTERM/SIGINT to both children, prefixes their logs
with `[ps]` / `[admin]`, and exits with a non-zero code if either child dies
unexpectedly. This is the only thing your container/process manager interacts
with.


## Configuration reference

All configuration is environment variables. The launcher reads `.env` if
present (no `dotenv` dep needed — it's a tiny parser in `tools/launcher.js`).

| Variable                          | Required | Default                                            | Notes |
|-----------------------------------|----------|----------------------------------------------------|-------|
| `PINKACORD_ADMIN_PASSWORD`        | **yes**  | —                                                  | Shared admin password; ≥ 8 chars |
| `PINKACORD_PS_HOST`               | no       | `127.0.0.1`                                        | Where the admin panel reaches PS |
| `PINKACORD_PS_PORT`               | no       | `8000`                                             | |
| `PINKACORD_ADMIN_BIND`            | no       | `127.0.0.1`                                        | Set to `0.0.0.0` only behind firewall/VPN |
| `PINKACORD_ADMIN_PORT`            | no       | `8001`                                             | |
| `PINKACORD_BOT_USERNAME`          | no       | —                                                  | Enables one-click hotpatch |
| `PINKACORD_BOT_PASSWORD`          | no       | —                                                  | Paired with bot username |
| `PINKACORD_LOGIN_URL`             | no       | `https://play.pokemonshowdown.com/api/login`       | Only override if you run your own login server |
| `PINKACORD_HOTPATCH_TIMEOUT_MS`   | no       | `15000`                                            | Bot-hotpatch round-trip budget |


## Bot account setup (for one-click hotpatch)

Without this, after every change in the admin panel you'll see the manual
commands to paste. With it, the panel applies changes itself.

1. Open `https://play.pokemonshowdown.com/`.
2. In the gear menu, register an account — e.g. `PinkacordAdmin` — with a strong password.
3. In your PS server repo, add the user to `config/usergroups.csv`:
   ```
   pinkacordadmin,~
   ```
4. Set the env vars (locally in `.env`, or via `fly secrets set` in production):
   ```
   PINKACORD_BOT_USERNAME=pinkacordadmin
   PINKACORD_BOT_PASSWORD=<that strong password>
   ```
5. Restart the launcher. The dashboard now shows "✅ Bot account configured".

**Security note:** the bot account has full Administrator powers on your PS
server. Treat its password like a server credential. Rotate it if it leaks.


## Local Docker

```sh
# Build the image
docker build -t pinkacord:local .

# Run it. Mount a volume so ladder/modlog/audit log survive container restarts.
docker run -d --name pinkacord \
  -p 8000:8000 -p 8001:8001 \
  -e PINKACORD_ADMIN_PASSWORD='change-me' \
  -e PINKACORD_ADMIN_BIND='0.0.0.0' \
  -v pinkacord-logs:/app/logs \
  -v pinkacord-content:/app/content \
  -v pinkacord-databases:/app/databases \
  pinkacord:local

# Tail logs
docker logs -f pinkacord
```

Stopping: `docker stop pinkacord` sends SIGTERM, which the launcher forwards
to both children. Clean shutdown in <5 seconds.

The `Dockerfile` is multi-stage (build → slim runtime) and runs as the non-root
`node` user. The image is ~250 MB.


## Fly.io deploy

Fly.io is recommended because: free hobby credit, free TLS, websocket-friendly,
multi-region support, and 256MB-to-multi-GB instances on the same primitives.

```sh
# One-time
fly auth login
fly launch --copy-config --no-deploy
# When prompted, accept the existing fly.toml. Change the `app = "pinkacord-CHANGEME"`
# line in fly.toml to a unique name you own.

# Create the persistent volume in the same region you picked.
fly volumes create pinkacord_data --size 3 --region iad

# Set secrets (these never get written to fly.toml)
fly secrets set \
  PINKACORD_ADMIN_PASSWORD='change-me' \
  PINKACORD_BOT_USERNAME='pinkacordadmin' \
  PINKACORD_BOT_PASSWORD='the-bot-password'

# Ship it
fly deploy
```

After deploy:

- PS server is at `https://<your-app>.fly.dev/` — players connect to this
- Admin panel is at `https://<your-app>.fly.dev:8443/` — **review the
  security note below before exposing this publicly**
- Health check is at `/health` on port 8001 (orchestrator hits this internally)

### Admin panel exposure

The `fly.toml` we ship exposes the admin panel on port 8443. **For real
production, gate this with Cloudflare Access, Tailscale, or Fly's private
networking** so randoms can't even reach the login page. To do that, remove
the second `[[services]]` block (or set `auto_start_machines = false` for it)
and instead connect over Wireguard:

```sh
fly wireguard create
# Use the generated config to access http://<app>.internal:8001/ privately
```


## Backup & restore

There are three directories that hold user data:

| Path             | Contains                                                  |
|------------------|-----------------------------------------------------------|
| `content/`       | Canonical Pinkacord content (mons, moves, formats…) — git-tracked is best |
| `databases/`     | PS's ladder ratings, replays, modlog SQLite                |
| `logs/`          | PS's chat/battle logs **+** Pinkacord audit log            |

For Fly.io, `fly volumes` stores them on the attached volume. Take periodic
snapshots:

```sh
# Manual snapshot
fly volumes snapshots create vol_xxxxxxx

# List snapshots
fly volumes snapshots list -v vol_xxxxxxx

# Restore: create a new volume from the snapshot
fly volumes create pinkacord_data --snapshot-id snap_xxxxxxx
```

For self-hosting on a VPS, a nightly `tar` of those three dirs to S3 / B2 is
enough. The Pinkacord audit log is append-only so a daily snapshot loses at
most one day of admin actions.

To roll back content to a previous state, prefer `git revert` on `content/`
followed by `npm run pinkacord:build` rather than restoring from snapshot —
it's faster and keeps the audit trail intact.


## Scaling notes

**Single-VM ceiling.** PS is single-Node-process plus a small pool of
subprocess workers. The hard ceiling on one VM is ~3000 concurrent battles
on a modern shared-cpu-2x. Our content layer adds zero runtime cost. The
admin panel is idle 99% of the time.

**When to upgrade VM size:**
- Lobby feels laggy → bump CPU
- Battle subprocesses OOM → bump RAM
- > 200 concurrent battles → vertical scale first; PS doesn't shard horizontally

**Horizontal scaling.** Out of scope for v1. PS supports a multi-server
federation pattern but it's complex and unnecessary at our scale.


## Production hardening checklist

Before pointing real users at this, walk through these:

- [ ] `.env` is not committed (`.dockerignore` and `.gitignore` already cover it)
- [ ] `PINKACORD_ADMIN_PASSWORD` is unique, ≥ 16 chars, stored in a secret manager
- [ ] `PINKACORD_BOT_PASSWORD` is similarly strong (treat as admin credential)
- [ ] Admin panel is NOT reachable on the public internet (Cloudflare Access / Tailscale / private subnet)
- [ ] PS's `config/config.js` has `lockdown` settings reviewed for your audience
- [ ] `config/usergroups.csv` lists only people you trust as `~` Administrators
- [ ] Volume snapshots are scheduled (Fly.io: weekly is fine for small communities)
- [ ] Outbound DNS to `play.pokemonshowdown.com` is allowed (needed for login server unless self-hosted)
- [ ] You have a runbook for hotpatch failures (manual paste; full restart as last resort)
- [ ] Audit log (`logs/pinkacord/audit.jsonl`) is included in your backup rotation
- [ ] PS server's `https://your-app.fly.dev/` answers 200
- [ ] Admin panel's `/health` answers 200
- [ ] A test admin login succeeds and the dashboard renders


## Common failure modes

| Symptom                                           | What to check                                                |
|---------------------------------------------------|--------------------------------------------------------------|
| Admin panel won't start: "PINKACORD_ADMIN_PASSWORD is required" | Set the env var or check `.env` is in the right directory   |
| Admin login fails immediately                     | Browser stripped the cookie — make sure you're on HTTPS in prod (SameSite=Strict requires it for cross-site iframes) |
| Build succeeds but `/hotpatch` returns "access denied" | Bot account isn't in `config/usergroups.csv` with `~` rank — check the comma format |
| Bot hotpatch hangs                                | PS_HOST / PS_PORT mismatch; or PS server not running yet (launcher gives it 1.5s head start) |
| Players see WebSocket disconnects                 | Fly.io free tier: machine paused for inactivity — set `auto_stop_machines = false` (already in our fly.toml) |
| Custom mons appear as missingno on the client     | Client overlay isn't deployed; rebuild via `npm run pinkacord-client:build` and serve `dist/pinkacord-overlay.js` from the client |
| `npm run pinkacord:build` fails on a fresh checkout | Run `npm ci` first; the generator depends on Zod in node_modules |
