import { Bot, InputFile, InlineKeyboard, InputMediaBuilder, type Context } from "grammy";
import {
  allow,
  floodTtl,
  getUserLang,
  toggleUserLang,
  getUserDocMode,
  toggleUserDocMode,
} from "./limits.js";
import {
  fetchStory,
  fetchUserStories,
  BusyError,
  ProtectedError,
  NotFoundError,
  UnknownUserError,
  type StoryMedia,
} from "./mtproto.js";
import { messages, type Lang } from "./i18n.js";

if (!process.env.BOT_TOKEN) {
  throw new Error("Missing BOT_TOKEN environment variable");
}

export const bot = new Bot(process.env.BOT_TOKEN);

// t.me/user/s/123  |  t.me/user  |  @user
const LINK = /(?:https?:\/\/)?t\.me\/([A-Za-z0-9_]{5,32})\/s\/(\d+)\/?/i;
const PROFILE = /^(?:https?:\/\/)?t\.me\/([A-Za-z0-9_]{5,32})\/?$/i;
const NAME = /^@([A-Za-z0-9_]{5,32})$/;

const CAPTION_MAX = 1024; // Bot API limit for media captions

function formatPostedTime(unix?: number): string {
  if (!unix || !Number.isFinite(unix) || unix <= 0) return "";
  const d = new Date(unix * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  const mm = pad(d.getUTCMonth() + 1);
  const dd = pad(d.getUTCDate());
  const hh = pad(d.getUTCHours());
  const min = pad(d.getUTCMinutes());
  return `${yyyy}-${mm}-${dd} ${hh}:${min} UTC`;
}

function captionFor(m: StoryMedia, lang: Lang): string | undefined {
  const t = messages[lang];
  const metaLines: string[] = [];

  const posted = formatPostedTime(m.date);
  if (posted) {
    metaLines.push(`${t.posted} ${posted}`);
  }

  if (m.expireDate) {
    const now = Math.floor(Date.now() / 1000);
    const diff = m.expireDate - now;
    if (diff > 0) {
      const h = Math.floor(diff / 3600);
      const min = Math.floor((diff % 3600) / 60);
      metaLines.push(t.expires_in(h, min));
    } else {
      metaLines.push(t.profile_story);
    }
  } else if (m.pinned) {
    metaLines.push(t.profile_story);
  }

  if (m.username && m.id) {
    metaLines.push(`${t.direct_link} https://t.me/${m.username}/s/${m.id}`);
  }

  const metaText = metaLines.join("\n");
  const text = m.caption?.trim();

  if (!text) {
    return metaText || undefined;
  }

  if (!metaText) {
    return text.length > CAPTION_MAX ? text.slice(0, CAPTION_MAX - 1) + "…" : text;
  }

  const suffix = `\n\n${metaText}`;
  const maxTextLen = CAPTION_MAX - suffix.length;
  const trimmedText = text.length > maxTextLen ? text.slice(0, maxTextLen - 1) + "…" : text;
  return `${trimmedText}${suffix}`;
}

async function sendWithRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const isNetwork =
        err?.message?.includes("Network request") ||
        err?.message?.includes("fetch failed") ||
        err?.name === "HttpError";
      if (isNetwork && attempt < retries) {
        console.warn(`[BOT] Transient network failure on attempt ${attempt}, retrying in 500ms...`);
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

async function sendSingleItem(ctx: Context, m: StoryMedia, asDoc: boolean, lang: Lang) {
  const filename = m.isVideo ? `story-${m.id}.mp4` : `story-${m.id}.jpg`;
  const caption = captionFor(m, lang);
  const opts = caption ? { caption } : {};

  if (asDoc) {
    await sendWithRetry(() =>
      ctx.replyWithDocument(new InputFile(m.buffer, filename), opts)
    );
    return;
  }

  if (m.isVideo) {
    try {
      await sendWithRetry(() =>
        ctx.replyWithVideo(new InputFile(m.buffer, filename), opts)
      );
    } catch (err: any) {
      console.warn("replyWithVideo failed, falling back to document:", err?.message);
      await sendWithRetry(() =>
        ctx.replyWithDocument(new InputFile(m.buffer, filename), opts)
      );
    }
    return;
  }

  // Photo
  try {
    await sendWithRetry(() =>
      ctx.replyWithPhoto(new InputFile(m.buffer, filename), opts)
    );
  } catch (err: any) {
    console.warn("replyWithPhoto failed, falling back to document:", err?.message);
    await sendWithRetry(() =>
      ctx.replyWithDocument(new InputFile(m.buffer, filename), opts)
    );
  }
}

async function sendMediaGroupOrSingle(
  ctx: Context,
  items: StoryMedia[],
  asDoc: boolean,
  lang: Lang
) {
  if (items.length === 1) {
    await sendSingleItem(ctx, items[0], asDoc, lang);
    return;
  }

  // Telegram limits media groups to max 10 items
  for (let i = 0; i < items.length; i += 10) {
    const batch = items.slice(i, i + 10);

    if (asDoc) {
      const group = batch.map((m) =>
        InputMediaBuilder.document(
          new InputFile(m.buffer, m.isVideo ? `story-${m.id}.mp4` : `story-${m.id}.jpg`),
          { caption: captionFor(m, lang) }
        )
      );

      try {
        await sendWithRetry(() => ctx.replyWithMediaGroup(group));
      } catch (e) {
        console.warn("Document media group failed, falling back to single sends:", e);
        for (const m of batch) {
          await sendSingleItem(ctx, m, true, lang);
        }
      }
    } else {
      const group = batch.map((m) => {
        const file = new InputFile(m.buffer, m.isVideo ? `story-${m.id}.mp4` : `story-${m.id}.jpg`);
        const caption = captionFor(m, lang);
        return m.isVideo
          ? InputMediaBuilder.video(file, { caption })
          : InputMediaBuilder.photo(file, { caption });
      });

      try {
        await sendWithRetry(() => ctx.replyWithMediaGroup(group));
      } catch (e) {
        console.warn("Media group failed, falling back to single sends:", e);
        for (const m of batch) {
          await sendSingleItem(ctx, m, false, lang);
        }
      }
    }
  }
}

function storyKeyboard(username: string, lang: Lang, asDoc: boolean): InlineKeyboard {
  const t = messages[lang];
  return new InlineKeyboard()
    .text(t.btn_active, `dl:${username}:all`)
    .row()
    .text(t.btn_latest, `dl:${username}:1`)
    .text(t.btn_last3, `dl:${username}:3`)
    .row()
    .text(t.btn_last5, `dl:${username}:5`)
    .text(t.btn_last10, `dl:${username}:10`)
    .row()
    .text(asDoc ? t.btn_quality_doc : t.btn_quality_media, `toggle_mode:${username}`)
    .text(t.btn_lang_switch, `toggle_lang:${username}`)
    .row()
    .text(t.btn_cancel, `dl:${username}:cancel`);
}

function formatErrorMessage(
  e: unknown,
  lang: Lang,
  opts: { username?: string; isTodayOnly?: boolean } = {}
): string {
  const t = messages[lang];
  const user = opts.username ?? "user";

  if (e instanceof UnknownUserError) {
    return t.err_unknown(user);
  }
  if (e instanceof ProtectedError) {
    return t.err_protected;
  }
  if (e instanceof NotFoundError) {
    return opts.isTodayOnly ? t.err_no_active(user) : t.err_not_found(user);
  }
  if (e instanceof BusyError) {
    return t.err_server_busy;
  }
  if ((e as Error)?.message === "TOO_LARGE") {
    return t.err_too_large;
  }
  if (typeof (e as { seconds?: number })?.seconds === "number") {
    return t.err_rate_limited((e as { seconds: number }).seconds);
  }

  console.error("fetch failed:", (e as Error)?.message ?? e);
  return t.err_failed;
}

bot.command(["start", "help"], async (ctx) => {
  if (!ctx.from) return;
  const lang = await getUserLang(ctx.from.id, ctx.from.language_code);
  await ctx.reply(messages[lang].welcome);
});

bot.command(["lang", "language"], async (ctx) => {
  if (!ctx.from) return;
  const currentLang = await getUserLang(ctx.from.id, ctx.from.language_code);
  const nextLang = await toggleUserLang(ctx.from.id, currentLang);
  await ctx.reply(messages[nextLang].lang_changed);
});

bot.callbackQuery(/^toggle_mode:([A-Za-z0-9_]{5,32})$/, async (ctx) => {
  if (!ctx.from) return;
  const username = ctx.match[1];
  const asDoc = await toggleUserDocMode(ctx.from.id);
  const lang = await getUserLang(ctx.from.id, ctx.from.language_code);
  const t = messages[lang];

  await ctx.answerCallbackQuery({
    text: asDoc ? t.mode_toggled_doc : t.mode_toggled_media,
  });

  await ctx.editMessageReplyMarkup({
    reply_markup: storyKeyboard(username, lang, asDoc),
  }).catch(() => {});
});

bot.callbackQuery(/^toggle_lang:([A-Za-z0-9_]{5,32})$/, async (ctx) => {
  if (!ctx.from) return;
  const username = ctx.match[1];
  const currentLang = await getUserLang(ctx.from.id, ctx.from.language_code);
  const nextLang = await toggleUserLang(ctx.from.id, currentLang);
  const asDoc = await getUserDocMode(ctx.from.id);
  const t = messages[nextLang];

  await ctx.answerCallbackQuery({ text: t.lang_changed });

  await ctx.editMessageText(t.choose_stories(username), {
    reply_markup: storyKeyboard(username, nextLang, asDoc),
  }).catch(() => {});
});

bot.callbackQuery(/^dl:([A-Za-z0-9_]{5,32}):cancel$/, async (ctx) => {
  if (!ctx.from) return;
  const lang = await getUserLang(ctx.from.id, ctx.from.language_code);
  await ctx.answerCallbackQuery({ text: messages[lang].cancelled });
  await ctx.deleteMessage().catch(() => {});
});

bot.callbackQuery(/^dl:([A-Za-z0-9_]{5,32}):(all|1|3|5|10)$/, async (ctx) => {
  if (!ctx.from) return;

  const username = ctx.match[1];
  const mode = ctx.match[2];
  const lang = await getUserLang(ctx.from.id, ctx.from.language_code);
  const asDoc = await getUserDocMode(ctx.from.id);
  const t = messages[lang];

  if (!(await allow(ctx.from.id))) {
    await ctx.answerCallbackQuery({ text: t.slow_down, show_alert: true });
    return;
  }
  const wait = await floodTtl();
  if (wait) {
    await ctx.answerCallbackQuery({ text: t.busy(wait), show_alert: true });
    return;
  }

  await ctx.answerCallbackQuery();
  await ctx.replyWithChatAction("typing").catch(() => {});

  const isTodayOnly = mode === "all";
  const limit = isTodayOnly ? 20 : parseInt(mode, 10);
  const label =
    isTodayOnly
      ? t.label_active
      : mode === "1"
        ? t.label_latest
        : t.label_last_n(limit);

  console.log(`[BOT] User clicked ${mode} (limit ${limit}) for @${username}`);
  await ctx.editMessageText(t.fetching(label, username)).catch(() => {});

  try {
    const items = await fetchUserStories(username, limit, isTodayOnly);
    await sendMediaGroupOrSingle(ctx, items, asDoc, lang);

    const note =
      !isTodayOnly && mode !== "1" && items.length < limit
        ? t.only_available(items.length)
        : "";
    await ctx.editMessageText(t.sent_count(items.length, username, note)).catch(() => {});
  } catch (e: unknown) {
    const errMsg = formatErrorMessage(e, lang, { username, isTodayOnly });
    await ctx.editMessageText(errMsg).catch(() => ctx.reply(errMsg));
  }
});

bot.on("message:text", async (ctx) => {
  if (!ctx.from) return; // channel posts / anonymous admins have no user to reply to
  const lang = await getUserLang(ctx.from.id, ctx.from.language_code);
  const asDoc = await getUserDocMode(ctx.from.id);
  const t = messages[lang];

  const text = ctx.message.text.trim();
  const link = text.match(LINK);
  const profile = text.match(PROFILE);
  const name = text.match(NAME);
  if (!link && !profile && !name) {
    return ctx.reply(t.prompt_usage);
  }

  // Direct story link: fetch that specific story directly
  if (link) {
    if (!(await allow(ctx.from.id))) return ctx.reply(t.slow_down);
    const wait = await floodTtl();
    if (wait) return ctx.reply(t.busy(wait));

    await ctx.replyWithChatAction("typing").catch(() => {});
    const username = link[1];
    const storyId = Number(link[2]);
    const statusMsg = await ctx.reply(t.fetching_single(storyId, username));

    try {
      const item = await fetchStory(username, storyId);
      await sendMediaGroupOrSingle(ctx, [item], asDoc, lang);
      await ctx.api.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
    } catch (e: unknown) {
      const errMsg = formatErrorMessage(e, lang, { username });
      await ctx.api.editMessageText(ctx.chat.id, statusMsg.message_id, errMsg).catch(() => ctx.reply(errMsg));
    }
    return;
  }

  // Username or profile: present interactive buttons
  const username = (profile?.[1] ?? name![1]).replace(/^@/, "");

  await ctx.reply(t.choose_stories(username), {
    reply_markup: storyKeyboard(username, lang, asDoc),
  });
});
