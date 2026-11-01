const { BOT_TOKEN, APP_URL, WEBHOOK_SECRET } = process.env;

if (!BOT_TOKEN || !APP_URL || !WEBHOOK_SECRET) {
  console.error("Missing BOT_TOKEN / APP_URL / WEBHOOK_SECRET");
  process.exit(1);
}

const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url: `${APP_URL}/api/webhook`,
    secret_token: WEBHOOK_SECRET,
    allowed_updates: ["message", "callback_query", "inline_query"],
    drop_pending_updates: true,
  }),
});
console.log(await res.json());
