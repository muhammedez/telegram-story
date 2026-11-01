import { Bot, InputFile, InlineKeyboard, type Context } from "grammy";
import { allow, floodTtl } from "./limits.js";
import {
  fetchStory,
  fetchActive,
  BusyError,
  ProtectedError,
  NotFoundError,
  UnknownUserError,
  type StoryMedia,
} from "./mtproto.js";

export const bot = new Bot(process.env.BOT_TOKEN!);

// t.me/user/s/123  |  t.me/user  |  @user
const LINK = /(?:https?:\/\/)?t\.me\/([A-Za-z0-9_]{5,32})\/s\/(\d+)/i;
const PROFILE = /^(?:https?:\/\/)?t\.me\/([A-Za-z0-9_]{5,32})\/?$/i;
const NAME = /^@([A-Za-z0-9_]{5,32})$/;

const CAPTION_MAX = 1024; // Bot API limit for media captions

function captionFor(m: StoryMedia): string | undefined {
  if (!m.caption) return undefined;
  const text = m.caption.trim();
  if (!text) return undefined;
  return text.length > CAPTION_MAX ? text.slice(0, CAPTION_MAX - 1) + "…" : text;
}

async function send(ctx: Context, m: StoryMedia) {
  const file = new InputFile(m.buffer, m.isVideo ? "story.mp4" : "story.jpg");
  const caption = captionFor(m);
  const opts = caption ? { caption } : {};
  await (m.isVideo ? ctx.replyWithVideo(file, opts) : ctx.replyWithPhoto(file, opts));
}

function storyKeyboard(username: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("📅 Today's Active Stories", `dl:${username}:all`)
    .row()
    .text("1️⃣ Latest Story", `dl:${username}:1`)
    .text("3️⃣ Last 3 Stories", `dl:${username}:3`)
    .row()
    .text("5️⃣ Last 5 Stories", `dl:${username}:5`)
    .text("🔟 Last 10 Stories", `dl:${username}:10`)
    .row()
    .text("❌ Cancel", `dl:${username}:cancel`);
}

bot.command(["start", "help"], (ctx) =>
  ctx.reply(
    "👋 Send @username (or t.me/username) to choose how many stories to download:\n" +
      "• Today's active stories\n" +
      "• Last 3 stories\n" +
      "• Last 10 stories\n" +
      "and more!\n\n" +
      "Or send a single story link: t.me/user/s/123"
  )
);

bot.callbackQuery(/^dl:([A-Za-z0-9_]{5,32}):cancel$/, async (ctx) => {
  await ctx.answerCallbackQuery({ text: "Cancelled" });
  await ctx.deleteMessage().catch(() => {});
});

bot.callbackQuery(/^dl:([A-Za-z0-9_]{5,32}):(all|1|3|5|10)$/, async (ctx) => {
  if (!ctx.from) return;

  const username = ctx.match[1];
  const mode = ctx.match[2];

  if (!(await allow(ctx.from.id))) {
    await ctx.answerCallbackQuery({ text: "Slow down: max 5 requests/minute.", show_alert: true });
    return;
  }
  const wait = await floodTtl();
  if (wait) {
    await ctx.answerCallbackQuery({ text: `Busy, try again in ${wait}s.`, show_alert: true });
    return;
  }

  await ctx.answerCallbackQuery();

  const limit = mode === "all" ? 20 : parseInt(mode, 10);
  const label =
    mode === "all"
      ? "today's active stories"
      : mode === "1"
        ? "the latest story"
        : `the last ${limit} stories`;

  await ctx.editMessageText(`⏳ Fetching ${label} for @${username}...`).catch(() => {});

  try {
    const items = await fetchActive(username, limit);
    for (const m of items) {
      await send(ctx, m);
    }
    await ctx.editMessageText(
      `✅ Sent ${items.length} ${items.length === 1 ? "story" : "stories"} for @${username}.`
    ).catch(() => {});
  } catch (e: any) {
    let errMsg = "Failed to fetch stories.";
    if (e instanceof UnknownUserError) {
      errMsg = `❌ Username @${username} does not exist.`;
    } else if (e instanceof ProtectedError) {
      errMsg = "❌ Stories for this account are protected and can't be saved.";
    } else if (e instanceof NotFoundError) {
      errMsg = `ℹ️ No active stories found for @${username} (or they expired/are private).`;
    } else if (e instanceof BusyError) {
      errMsg = "⚠️ Server is busy right now, please try again in a few seconds.";
    } else if (e?.message === "TOO_LARGE") {
      errMsg = "⚠️ Story is too large to send (>45MB).";
    } else if (typeof e?.seconds === "number") {
      errMsg = `⚠️ Rate limited by Telegram, retry in ${e.seconds}s.`;
    } else {
      console.error("fetch failed:", e?.message);
    }
    await ctx.editMessageText(errMsg).catch(() => ctx.reply(errMsg));
  }
});

bot.on("message:text", async (ctx) => {
  if (!ctx.from) return; // channel posts / anonymous admins have no user to reply to
  const text = ctx.message.text.trim();
  const link = text.match(LINK);
  const profile = text.match(PROFILE);
  const name = text.match(NAME);
  if (!link && !profile && !name) {
    return ctx.reply("Send @username or t.me/username, or t.me/user/s/123 for one story.");
  }

  // Direct story link: fetch that specific story directly
  if (link) {
    if (!(await allow(ctx.from.id))) return ctx.reply("Slow down: max 5 requests/minute.");
    const wait = await floodTtl();
    if (wait) return ctx.reply(`Busy, try again in ${wait}s.`);

    const username = link[1];
    const storyId = Number(link[2]);
    const statusMsg = await ctx.reply(`⏳ Fetching story #${storyId} for @${username}...`);

    try {
      const item = await fetchStory(username, storyId);
      await send(ctx, item);
      await ctx.api.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
    } catch (e: any) {
      let errMsg = "Failed to fetch that story.";
      if (e instanceof UnknownUserError) errMsg = "That username doesn't exist.";
      else if (e instanceof ProtectedError) errMsg = "That story is protected and can't be saved.";
      else if (e instanceof NotFoundError) errMsg = "Story not found, expired, or not visible.";
      else if (e instanceof BusyError) errMsg = "Busy right now, try again in a few seconds.";
      else if (e?.message === "TOO_LARGE") errMsg = "Story is too large to send.";
      else if (typeof e?.seconds === "number") errMsg = `Rate limited by Telegram, retry in ${e.seconds}s.`;
      else console.error("fetch failed:", e?.message);

      await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, errMsg).catch(() => ctx.reply(errMsg));
    }
    return;
  }

  // Username or profile: present interactive button options
  const username = (profile?.[1] ?? name![1]).replace(/^@/, "");

  await ctx.reply(`📖 Stories for @${username}\nChoose what you want to download:`, {
    reply_markup: storyKeyboard(username),
  });
});
