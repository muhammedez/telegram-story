# AGENTS.md: Telegram Story Downloader Bot (MTProto, Vercel)

## Goal
A Telegram bot. The user sends a story link (`https://t.me/<username>/s/<id>`) or `@username`. The bot replies with the story media. Fetching goes through a userbot (MTProto, GramJS), and **story views must stay anonymous**.

## Hard rules (never violate)
1. NEVER call `stories.ReadStories`, `stories.IncrementStoryViews`, or `stories.ActivateStealthMode` anywhere in `src/` or `api/`.
2. Only story calls allowed: `stories.GetStoriesByID`, `stories.GetPeerStories`, `stories.GetPinnedStories`, and `client.downloadMedia`.
3. Refuse stories with `noforwards === true`.
4. Never log or commit `SESSION`, `API_HASH`, `BOT_TOKEN`.
5. Every MTProto use goes through `withClient()` (lock, connect, run, always disconnect).
6. Do not write files to disk at runtime (Vercel FS is ephemeral). Keep media in memory.
7. Do each step in order. Run its **Verify** before moving on.

## Stack
TypeScript (ESM), Node 20+, `telegram` (GramJS), `grammy`, `@upstash/redis`, `@vercel/functions`, Vercel Node serverless functions.

## Architecture
```
Telegram --webhook--> api/webhook.ts
                        |- check secret header, dedupe update_id (Redis)
                        |- return 200 fast, continue via waitUntil()
                        |- bot handlers: parse link, per-user rate limit
                        '- withClient(): Redis lock -> connect -> fetch -> disconnect
                      send media back via Bot API
```

## Env vars
```
BOT_TOKEN=            # from @BotFather
API_ID=               # my.telegram.org
API_HASH=
SESSION=              # produced by scripts/session.ts
WEBHOOK_SECRET=       # random 32+ chars, A-Za-z0-9_-
APP_URL=              # https://your-project.vercel.app
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

---

## Step 1: Scaffold
```bash
mkdir story-bot && cd story-bot && npm init -y
npm i telegram grammy @upstash/redis @vercel/functions
npm i -D typescript tsx @types/node vercel
mkdir api src scripts
```
`package.json` additions:
```json
{
  "type": "module",
  "scripts": {
    "session": "tsx scripts/session.ts",
    "webhook": "tsx scripts/set-webhook.ts",
    "check:anon": "bash scripts/check-anon.sh",
    "typecheck": "tsc --noEmit"
  }
}
```
`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "noEmit": true
  },
  "include": ["api", "src", "scripts"]
}
```
`.gitignore`: `node_modules`, `.env*`, `.vercel`.
**Verify:** `npm run typecheck` passes.

## Step 2: Generate the session (local only, run once)
`scripts/session.ts`:
```ts
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import readline from "node:readline/promises";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string) => rl.question(q);

const client = new TelegramClient(
  new StringSession(""),
  Number(process.env.API_ID),
  process.env.API_HASH!,
  { connectionRetries: 3 }
);

await client.start({
  phoneNumber: () => ask("Phone (+...): "),
  phoneCode: () => ask("Code: "),
  password: () => ask("2FA password (if any): "),
  onError: (e) => console.error(e),
});

console.log("\nSESSION=" + client.session.save());
await client.disconnect();
rl.close();
process.exit(0);
```
Run: `API_ID=... API_HASH=... npm run session`. Use a **dedicated** Telegram account, not a personal one.
**Verify:** a SESSION string prints. Put it in `.env.local` and Vercel env vars.

## Step 3: Redis helpers
`src/redis.ts`:
```ts
import { Redis } from "@upstash/redis";
export const redis = Redis.fromEnv();
```
`src/limits.ts`:
```ts
import { redis } from "./redis.js";

/** true if this update_id was already processed */
export async function isDuplicate(updateId: number): Promise<boolean> {
  const ok = await redis.set(`upd:${updateId}`, 1, { nx: true, ex: 3600 });
  return ok === null;
}

/** allow `max` requests per `windowSec` per user */
export async function allow(userId: number, max = 5, windowSec = 60): Promise<boolean> {
  const key = `rl:${userId}`;
  const n = await redis.incr(key);
  if (n === 1) await redis.expire(key, windowSec);
  return n <= max;
}

/** global cool-down after FLOOD_WAIT */
export async function setFlood(seconds: number) {
  await redis.set("flood", 1, { ex: seconds });
}
export async function floodTtl(): Promise<number> {
  return Math.max(await redis.ttl("flood"), 0);
}
```
**Verify:** a small tsx script calls `allow(1)` six times and the 6th returns `false`.

## Step 4: MTProto layer
`src/mtproto.ts`:
```ts
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { LogLevel } from "telegram/extensions/Logger.js";
import { redis } from "./redis.js";
import { setFlood } from "./limits.js";

export class BusyError extends Error {}
export class ProtectedError extends Error {}
export class NotFoundError extends Error {}

const RELEASE = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;

export async function withClient<T>(fn: (c: TelegramClient) => Promise<T>): Promise<T> {
  const token = crypto.randomUUID();
  // one live connection per session avoids AUTH_KEY_DUPLICATED
  const locked = await redis.set("mt:lock", token, { nx: true, ex: 50 });
  if (!locked) throw new BusyError();

  const client = new TelegramClient(
    new StringSession(process.env.SESSION!),
    Number(process.env.API_ID),
    process.env.API_HASH!,
    { connectionRetries: 3, useWSS: true }
  );
  client.setLogLevel(LogLevel.NONE);

  try {
    await client.connect();
    return await fn(client);
  } catch (e: any) {
    if (typeof e?.seconds === "number") await setFlood(e.seconds); // FloodWaitError
    throw e;
  } finally {
    await client.disconnect().catch(() => {});
    await client.destroy().catch(() => {});
    await redis.eval(RELEASE, ["mt:lock"], [token]).catch(() => {});
  }
}

export interface StoryMedia {
  buffer: Buffer;
  isVideo: boolean;
}

const MAX_BYTES = 45 * 1024 * 1024; // Bot API upload cap is 50MB

async function toMedia(client: TelegramClient, story: Api.TypeStoryItem): Promise<StoryMedia> {
  if (!(story instanceof Api.StoryItem)) throw new NotFoundError();
  if (story.noforwards) throw new ProtectedError();
  if (!story.media) throw new NotFoundError();

  const isVideo =
    story.media instanceof Api.MessageMediaDocument &&
    (story.media.document as Api.Document)?.mimeType?.startsWith("video/") === true;

  const buffer = (await client.downloadMedia(story.media)) as Buffer | undefined;
  if (!buffer?.length) throw new NotFoundError();
  if (buffer.length > MAX_BYTES) throw new Error("TOO_LARGE");
  return { buffer, isVideo };
}

export async function fetchStory(username: string, id: number): Promise<StoryMedia> {
  return withClient(async (client) => {
    const peer = await client.getInputEntity(username);
    const res = await client.invoke(new Api.stories.GetStoriesByID({ peer, id: [id] }));
    const story = res.stories[0];
    if (!story) throw new NotFoundError();
    return toMedia(client, story);
  });
}

export async function fetchActive(username: string, limit = 5): Promise<StoryMedia[]> {
  return withClient(async (client) => {
    const peer = await client.getInputEntity(username);
    const res = await client.invoke(new Api.stories.GetPeerStories({ peer }));
    const out: StoryMedia[] = [];
    for (const s of res.stories.stories.slice(0, limit)) {
      try { out.push(await toMedia(client, s)); } catch (e) {
        if (!(e instanceof ProtectedError || e instanceof NotFoundError)) throw e;
      }
    }
    if (!out.length) throw new NotFoundError();
    return out;
  });
}
```
**Verify (local):** a tsx script calls `fetchStory("<public-username>", <id>)` and writes the buffer to a local file. It opens correctly, and the process exits (no hang).

## Step 5: Bot logic
`src/bot.ts`:
```ts
import { Bot, InputFile } from "grammy";
import { allow, floodTtl } from "./limits.js";
import { fetchStory, fetchActive, BusyError, ProtectedError, NotFoundError, StoryMedia } from "./mtproto.js";

export const bot = new Bot(process.env.BOT_TOKEN!);

const LINK = /(?:https?:\/\/)?t\.me\/([A-Za-z0-9_]{5,32})\/s\/(\d+)/i;
const HANDLE = /^@([A-Za-z0-9_]{5,32})$/;

bot.command("start", (ctx) =>
  ctx.reply("Send a story link (t.me/user/s/123) or @username for active public stories.")
);

bot.on("message:text", async (ctx) => {
  const text = ctx.message.text.trim();
  const link = text.match(LINK);
  const handle = text.match(HANDLE);
  if (!link && !handle) return ctx.reply("Send t.me/username/s/123 or @username");

  if (!(await allow(ctx.from.id))) return ctx.reply("Slow down: max 5 requests/minute.");
  const wait = await floodTtl();
  if (wait) return ctx.reply(`Busy, try again in ${wait}s.`);

  try {
    const items: StoryMedia[] = link
      ? [await fetchStory(link[1], Number(link[2]))]
      : await fetchActive(handle![1]);

    for (const m of items) {
      const file = new InputFile(m.buffer, m.isVideo ? "story.mp4" : "story.jpg");
      await (m.isVideo ? ctx.replyWithVideo(file) : ctx.replyWithPhoto(file));
    }
  } catch (e: any) {
    if (e instanceof ProtectedError) return ctx.reply("That story is protected and can't be saved.");
    if (e instanceof NotFoundError) return ctx.reply("Story not found, expired, or not visible.");
    if (e instanceof BusyError) return ctx.reply("Busy right now, try again in a few seconds.");
    if (e?.message === "TOO_LARGE") return ctx.reply("Story is too large to send.");
    if (typeof e?.seconds === "number") return ctx.reply(`Rate limited by Telegram, retry in ${e.seconds}s.`);
    console.error("fetch failed:", e?.message);
    return ctx.reply("Failed to fetch that story.");
  }
});
```
**Verify:** `npm run typecheck`.

## Step 6: Webhook endpoint
`api/webhook.ts` (Web-standard handler; respond fast, process in background):
```ts
import { waitUntil } from "@vercel/functions";
import type { Update } from "grammy/types";
import { bot } from "../src/bot.js";
import { isDuplicate } from "../src/limits.js";

let ready: Promise<void> | null = null;

export async function POST(request: Request): Promise<Response> {
  if (request.headers.get("x-telegram-bot-api-secret-token") !== process.env.WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }
  const update = (await request.json()) as Update;

  ready ??= bot.init();
  await ready;

  if (await isDuplicate(update.update_id)) return new Response("ok");

  waitUntil(
    bot.handleUpdate(update).catch((e) => console.error("update failed:", e?.message))
  );
  return new Response("ok");
}

export function GET() {
  return new Response("ok");
}
```
`vercel.json`:
```json
{
  "functions": {
    "api/webhook.ts": { "maxDuration": 60 }
  }
}
```
(Raise `maxDuration` if your plan allows. Fetch + download + upload must fit inside it.)

## Step 7: Webhook registration script
`scripts/set-webhook.ts`:
```ts
const { BOT_TOKEN, APP_URL, WEBHOOK_SECRET } = process.env;
const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url: `${APP_URL}/api/webhook`,
    secret_token: WEBHOOK_SECRET,
    allowed_updates: ["message"],
    drop_pending_updates: true,
  }),
});
console.log(await res.json());
```

## Step 8: Anonymity guard (CI + local)
`scripts/check-anon.sh`:
```bash
#!/usr/bin/env bash
if grep -rnE "ReadStories|IncrementStoryViews|ActivateStealthMode" src api; then
  echo "FAIL: view-registering call found"; exit 1
fi
echo "OK: no view-registering calls"
```
**Verify:** `npm run check:anon` prints OK.

## Step 9: Deploy
```bash
npx vercel link
# add every env var from the list above (production + preview)
npx vercel --prod
APP_URL=https://<project>.vercel.app npm run webhook   # (with BOT_TOKEN + WEBHOOK_SECRET set)
```
**Verify:** `https://api.telegram.org/bot<TOKEN>/getWebhookInfo` shows the URL, `pending_update_count` near 0, no `last_error_message`.

## Step 10: Acceptance tests (manual)
| Test | Expected |
|---|---|
| Send a public story link | Media returned within the function limit |
| Send an expired or invalid id | "Story not found..." |
| Send a protected story | "protected" refusal |
| Send `@username` with several active stories | Up to 5 returned |
| Send 6 requests in a minute | 6th gets "Slow down" |
| Two requests at once | Second gets "Busy", no crash |
| Same update delivered twice | Only one reply |
| **Anonymity:** second account posts a story, bot fetches it | Viewer list on that story is empty |

## Known risks (do not "fix" by weakening rules)
- Automating a user account is a gray area in Telegram's ToS. Heavy use can get the account limited or banned. Use a dedicated account and keep throttles on.
- `FLOOD_WAIT`: never retry in a loop; set the global cooldown and tell the user.
- Telegram can change server behavior. Re-run the anonymity test after any GramJS upgrade.
- Only serve content the account can legitimately see. Respect `noforwards`.
