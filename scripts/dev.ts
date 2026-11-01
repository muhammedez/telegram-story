import { bot } from "../src/bot.js";

// Local testing only: long polling instead of a webhook.
// Telegram allows exactly one delivery method per bot, so this clears any
// registered webhook. Re-register it with `npm run webhook` before deploying.
const missing = ["BOT_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"].filter(
  (k) => !process.env[k]
);
if (missing.length) {
  console.error(`Missing env: ${missing.join(", ")} (use --env-file=.env.local)`);
  process.exit(1);
}

console.log("Removing webhook (long polling mode)...");
await bot.api.deleteWebhook({ drop_pending_updates: true });

// Dev-only: shows every update the handler sees, so silence is diagnosable.
bot.use(async (ctx, next) => {
  const who = ctx.from ? `@${ctx.from.username ?? ctx.from.id}` : "unknown";
  console.log(`<- ${who}: ${ctx.message?.text ?? `update #${ctx.update.update_id}`}`);
  await next();
});

process.once("SIGINT", () => void bot.stop());
process.once("SIGTERM", () => void bot.stop());

await bot.start({
  drop_pending_updates: true,
  onStart: (me) => console.log(`Polling as @${me.username} — Ctrl+C to stop`),
});
console.log("Stopped.");
process.exit(0);
