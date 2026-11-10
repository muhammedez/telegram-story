# telegram-story

Telegram bot that returns the media of a story. Fetching happens over MTProto
(GramJS) with a dedicated user account; **story views stay anonymous** — no
`stories.ReadStories`, `stories.IncrementStoryViews` or
`stories.ActivateStealthMode` is ever called.

Send `@someone` (or `t.me/someone`) and the bot presents interactive buttons
to choose what to download: today's active stories, the latest story, the last 3
stories, the last 5, or the last 10 stories. A story link
`https://t.me/<username>/s/<id>` fetches that exact story directly.

## Layout

```
api/webhook.ts      Telegram webhook (secret header, dedupe, background handling)
src/bot.ts          grammy handlers: link parsing, rate limit, replies
src/mtproto.ts      withClient() lock + GetStoriesByID / GetPeerStories / downloadMedia
src/limits.ts       per-user rate limit, update dedupe, global FLOOD_WAIT cooldown
src/redis.ts        Upstash client
scripts/session.ts  one-off local login -> SESSION string
scripts/set-webhook.ts
scripts/check-anon.sh   CI guard against view-registering calls
```

## Setup

```bash
npm install
cp .env.example .env.local   # fill in values
```

1. `npm run session` (with `API_ID` / `API_HASH` set) → copy the printed
   `SESSION` into `.env.local`. Use a dedicated account, not a personal one.
2. `npx vercel link`, add every env var to Production + Preview, then
   `npx vercel --prod`.
3. `APP_URL=https://<project>.vercel.app npm run webhook` registers the hook.

## Checks

```bash
npm run typecheck    # tsc
npm run check:anon   # fails if a view-registering call appears in src/ or api/
npm run check:limits # needs Upstash env vars
npm run fetch -- <username> <storyId>   # needs MTProto env vars
npm run list -- <username>              # active story ids for a username
npm run webhook:info                    # registered webhook + pending updates
```

All scripts load `.env.local` themselves (`node --env-file`).

## Local testing (no deploy)

```bash
npm run fetch -- <username> <storyId>
npm run dev          # long polling; clears the webhook first
```

`npm run dev` deletes the registered webhook (Telegram allows one delivery
method at a time). Run `npm run webhook` again before relying on the deployed
endpoint.

## Rules

- Only `stories.GetStoriesByID`, `stories.GetPeerStories` and
  `client.downloadMedia` may touch stories.
- The `noforwards` flag doesn't block downloads: media is still served when the
  fetching account is allowed to see the story. Stories that are truly
  invisible (contacts/close-friends only) simply aren't returned.
- No runtime disk writes (media stays in memory); keep an eye on the 45 MB cap.
- On `FLOOD_WAIT` set the global cooldown; never retry in a loop.
