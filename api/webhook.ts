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
