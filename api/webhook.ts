import type { Update } from "grammy/types";
import { bot } from "../src/bot.js";
import { isDuplicate } from "../src/limits.js";

export const maxDuration = 60;

let ready: Promise<void> | null = null;

export async function POST(request: Request): Promise<Response> {
  if (request.headers.get("x-telegram-bot-api-secret-token") !== process.env.WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }

  let update: Update;
  try {
    update = (await request.json()) as Update;
  } catch {
    return new Response("bad request", { status: 400 });
  }

  if (!update || typeof update.update_id !== "number") {
    return new Response("bad request", { status: 400 });
  }

  ready ??= bot.init();
  await ready;

  if (await isDuplicate(update.update_id)) return new Response("ok");

  try {
    await bot.handleUpdate(update);
  } catch (e: any) {
    console.error("update failed:", e?.message);
  }

  return new Response("ok");
}

export function GET() {
  return new Response("ok");
}
