import { redis } from "./redis.js";
import type { Lang } from "./i18n.js";

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

/** get user language with fallback to Telegram language_code */
export async function getUserLang(userId: number, telegramLangCode?: string): Promise<Lang> {
  const saved = (await redis.get(`lang:${userId}`)) as string | null;
  if (saved === "ar" || saved === "en") return saved;
  return telegramLangCode?.toLowerCase().startsWith("ar") ? "ar" : "en";
}

/** toggle user language between English and Arabic */
export async function toggleUserLang(userId: number, current: Lang): Promise<Lang> {
  const next: Lang = current === "ar" ? "en" : "ar";
  await redis.set(`lang:${userId}`, next, { ex: 86400 * 365 });
  return next;
}

/** get user preference: send media as document (uncompressed) */
export async function getUserDocMode(userId: number): Promise<boolean> {
  const mode = await redis.get(`mode:${userId}`);
  return mode === "doc";
}

/** toggle user preference: document vs media */
export async function toggleUserDocMode(userId: number): Promise<boolean> {
  const current = await getUserDocMode(userId);
  const next = !current;
  if (next) {
    await redis.set(`mode:${userId}`, "doc", { ex: 86400 * 365 });
  } else {
    await redis.del(`mode:${userId}`);
  }
  return next;
}
