const { BOT_TOKEN } = process.env;
if (!BOT_TOKEN) {
  console.error("Missing BOT_TOKEN");
  process.exit(1);
}

const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`);
const body = (await res.json()) as {
  ok: boolean;
  description?: string;
  result?: {
    url: string;
    pending_update_count: number;
    last_error_date?: number;
    last_error_message?: string;
    ip_address?: string;
  };
};

if (!body.ok || !body.result) {
  console.error("Telegram said:", body.description ?? body);
  process.exit(1);
}

const r = body.result;
console.log(`url:                  ${r.url || "(none — polling mode or unregistered)"}`);
console.log(`pending_update_count: ${r.pending_update_count}`);
console.log(`ip_address:           ${r.ip_address ?? "-"}`);
if (r.last_error_message) {
  console.log(`last_error:           ${new Date((r.last_error_date ?? 0) * 1000).toISOString()} ${r.last_error_message}`);
} else {
  console.log("last_error:           none");
}
