# Pinkacord — Discord bridge bot

A small, opt-in companion process that watches your Pinkacord PS server for
tournament events and forwards them to a Discord channel via a webhook.

This is **not** required for the server to function. Run it if you want
auto-announcements of tournaments in your community Discord.


## What it does

- Logs in to your PS server as a registered bot account
- Joins the rooms you list in `PINKACORD_BOT_WATCH_ROOMS`
- Forwards these events to Discord:
  - 🏆 Tournament created (format, bracket type, size)
  - ▶️ Tournament started
  - ⚔️ New battle (with replay link)
  - 🥇 Tournament ended (winner)
- Dedupes duplicate events fired within 5 seconds
- Reconnects with exponential backoff if the WS drops


## What it does NOT do

- Two-way chat bridge (Discord messages don't go back to PS chat)
- Replay enrichment (just links the battle room URL)
- Tournament creation from Discord
- Slash-command interactions

These are deferred to a future iteration. The bot is a small, focused tool
on purpose.


## Setup

### 1. Create a PS account for the bot

Register a username (e.g. `PinkacordBridge`) at https://play.pokemonshowdown.com/
with a strong password. The account does NOT need admin (~) rank — Voice (+)
or even regular user is enough to read tournament messages from a public room.

### 2. Create a Discord webhook

In your Discord server: Server Settings → Integrations → Webhooks → New Webhook.
Pick the channel, copy the webhook URL.

### 3. Configure env vars

The bot uses the same `PINKACORD_BOT_USERNAME` / `PINKACORD_BOT_PASSWORD`
env vars the admin panel uses for one-click hotpatch. **If you're using
both features, the same bot account works for both** — but you can also
register two separate accounts if you want stronger separation of duties.

Add to `.env`:

```env
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/xxx/yyy
PINKACORD_BOT_WATCH_ROOMS=lobby,tournaments
# Optional: override which PS server the bot connects to
# PINKACORD_PS_HOST=127.0.0.1
# PINKACORD_PS_PORT=8000
```

### 4. Run it

```sh
node tools/discord-bot/bot.js
```

In production you'd run it under a process manager alongside the main launcher.
For Docker, add it as a sidecar container or extend `tools/launcher.js` to
spawn it as a third child (a small wins-vs-complexity call).


## Env var reference

| Variable                       | Required | Default                                | Notes                            |
|--------------------------------|----------|----------------------------------------|----------------------------------|
| `PINKACORD_BOT_USERNAME`       | **yes**  | —                                      | Same as admin-panel bot          |
| `PINKACORD_BOT_PASSWORD`       | **yes**  | —                                      | Same as admin-panel bot          |
| `DISCORD_WEBHOOK_URL`          | **yes**  | —                                      | From Discord webhook settings    |
| `PINKACORD_BOT_WATCH_ROOMS`    | no       | `lobby`                                | Comma-separated PS room ids      |
| `PINKACORD_PS_HOST`            | no       | `127.0.0.1`                            | PS server host                   |
| `PINKACORD_PS_PORT`            | no       | `8000`                                 | PS server port                   |
| `PINKACORD_LOGIN_URL`          | no       | `https://play.pokemonshowdown.com/api/login` | PS login server endpoint     |


## How it works under the hood

1. Open WebSocket to `ws://<ps>/showdown/websocket`
2. PS sends `|challstr|<token>`; bot POSTs to login server with name/pass/challstr
3. Login server returns a signed assertion; bot sends `|/trn name,0,assertion`
4. PS sends `|updateuser|*name|1|...` confirming registered login
5. Bot joins each watched room via `|/join roomid`
6. Bot reads incoming lines, looks for `|tournament|...` events, forwards to Discord
7. On disconnect (PS restart, network blip), bot reconnects with backoff


## Operational notes

- The bot is stateless. Killing it loses no data.
- A failed Discord webhook (rate-limited, deleted) is logged but doesn't
  crash the bot — it keeps trying for the next event.
- The bot's PS rank doesn't gate anything destructive; if its account gets
  compromised the blast radius is limited to whatever the rank allows.
- Treat `DISCORD_WEBHOOK_URL` as a secret — anyone with it can post in your
  channel.
