import { Api } from "telegram";
import { withClient, NotFoundError } from "../src/mtproto.js";

const username = (process.argv[2] ?? "").replace(/^@/, "");
if (!username) {
  console.error("usage: npm run list -- <username>");
  process.exit(2);
}
if (!process.env.SESSION || !process.env.API_ID || !process.env.API_HASH) {
  console.error("SKIP: SESSION / API_ID / API_HASH required");
  process.exit(2);
}

const iso = (unix: number) => new Date(unix * 1000).toISOString().replace(".000Z", "Z");

async function main() {
  return withClient(async (client) => {
    const peer = await client.getInputEntity(username);
    // stories.GetPeerStories and GetPinnedStories only read; they do not register a view.
    const res = await client.invoke(new Api.stories.GetPeerStories({ peer })).catch(() => null);
    const activeItems = (res?.stories?.stories ?? []).filter((s): s is Api.StoryItem => s instanceof Api.StoryItem);

    const pinnedRes = await client
      .invoke(new Api.stories.GetPinnedStories({ peer, offsetId: 0, limit: 50 }))
      .catch(() => null);
    const pinnedItems = (pinnedRes?.stories ?? []).filter((s): s is Api.StoryItem => s instanceof Api.StoryItem);

    if (!activeItems.length && !pinnedItems.length) {
      console.log(`No active or public profile stories on @${username} visible to this account.`);
      console.log("Either none are posted, or privacy is contacts/close-friends only.");
      return;
    }

    const printStory = (s: Api.StoryItem) => {
      const kind =
        s.media instanceof Api.MessageMediaPhoto
          ? "photo"
          : s.media instanceof Api.MessageMediaDocument
            ? (s.media.document as Api.Document)?.mimeType ?? "document"
            : "other";
      const flags = [
        s.pinned ? "pinned" : null,
        s.noforwards ? "noforwards" : null,
        s.public ? "public" : null,
        s.closeFriends ? "close-friends" : null,
      ].filter(Boolean);
      console.log(
        `id=${s.id}  ${kind}  posted=${iso(s.date)}  expires=${iso(s.expireDate)}` +
          (s.views?.viewsCount != null ? `  views=${s.views.viewsCount}` : "") +
          (flags.length ? `  [${flags.join(",")}]` : "") +
          (s.caption ? `\n    "${s.caption}"` : "")
      );
    };

    if (activeItems.length) {
      console.log(`@${username}: ${activeItems.length} active (24h) story item(s)\n`);
      for (const s of activeItems) printStory(s);
      console.log("");
    }

    if (pinnedItems.length) {
      console.log(`@${username}: ${pinnedItems.length} public profile/pinned story item(s)\n`);
      for (const s of pinnedItems) printStory(s);
      console.log("");
    }

    console.log(`Try: npm run fetch -- ${username} <id>`);
  });
}

try {
  await main();
  process.exit(0);
} catch (e: any) {
  if (e instanceof NotFoundError) console.error(`NOT FOUND: @${username} not visible to this account.`);
  else if (typeof e?.seconds === "number") console.error(`FLOOD_WAIT: retry in ${e.seconds}s.`);
  else console.error("FAILED:", e?.errorMessage ?? e?.message ?? e);
  process.exit(1);
}
