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
