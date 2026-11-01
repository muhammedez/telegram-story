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
