import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { LogLevel } from "telegram/extensions/Logger.js";
import { redis } from "./redis.js";
import { setFlood } from "./limits.js";

export class BusyError extends Error {}
export class ProtectedError extends Error {}
export class NotFoundError extends Error {}
export class UnknownUserError extends Error {}

/** Telegram errors that just mean "you can't see this story". */
const NOT_FOUND_CODES = new Set([
  "STORIES_NEVER_CREATED",
  "STORY_ID_INVALID",
  "PEER_ID_INVALID",
  "CHANNEL_PRIVATE",
  "CHANNEL_INVALID",
  "CHAT_FORWARDS_RESTRICTED",
]);

/** Telegram errors that mean the username itself doesn't resolve. */
const UNKNOWN_USER_CODES = new Set(["USERNAME_NOT_OCCUPIED", "USERNAME_INVALID"]);

function toAppError(e: any): unknown {
  if (e instanceof BusyError || e instanceof ProtectedError || e instanceof NotFoundError) return e;
  const code = typeof e?.errorMessage === "string" ? e.errorMessage : "";
  if (NOT_FOUND_CODES.has(code)) return new NotFoundError();
  if (UNKNOWN_USER_CODES.has(code)) return new UnknownUserError();
  return e;
}

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
    throw toAppError(e);
  } finally {
    await client.disconnect().catch(() => {});
    await client.destroy().catch(() => {});
    await redis.eval(RELEASE, ["mt:lock"], [token]).catch(() => {});
  }
}

export interface StoryMedia {
  buffer: Buffer;
  isVideo: boolean;
  caption?: string;
  id: number;
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
  return { buffer, isVideo, caption: story.caption, id: story.id };
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

export async function fetchActive(username: string, limit?: number): Promise<StoryMedia[]> {
  return withClient(async (client) => {
    const peer = await client.getInputEntity(username);
    const res = await client.invoke(new Api.stories.GetPeerStories({ peer }));

    // GetPeerStories also returns stories that expired hours ago; keep only
    // the ones still live, newest first.
    const now = Math.floor(Date.now() / 1000);
    let stories = res.stories.stories
      .filter((s): s is Api.StoryItem => s instanceof Api.StoryItem)
      .filter((s) => s.expireDate > now)
      .sort((a, b) => b.date - a.date);

    if (typeof limit === "number" && limit > 0) {
      stories = stories.slice(0, limit);
    } else {
      stories = stories.slice(0, 20);
    }

    const out: StoryMedia[] = [];
    let hadProtected = false;
    for (const s of stories) {
      try {
        out.push(await toMedia(client, s));
      } catch (e) {
        if (e instanceof ProtectedError) {
          hadProtected = true;
          continue;
        }
        if (e instanceof NotFoundError) continue;
        throw e;
      }
    }
    if (!out.length) {
      if (hadProtected) throw new ProtectedError();
      throw new NotFoundError();
    }
    return out;
  });
}
