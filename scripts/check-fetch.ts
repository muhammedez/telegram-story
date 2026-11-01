import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  fetchStory,
  fetchActive,
  BusyError,
  ProtectedError,
  NotFoundError,
  UnknownUserError,
  type StoryMedia,
} from "../src/mtproto.js";

const [usernameRaw, idRaw] = process.argv.slice(2);
if (!usernameRaw) {
  console.error("usage: npm run fetch -- <username>            # active stories");
  console.error("       npm run fetch -- <username> <storyId>  # one story");
  process.exit(2);
}
if (!process.env.SESSION || !process.env.API_ID || !process.env.API_HASH) {
  console.error("SKIP: SESSION / API_ID / API_HASH required");
  process.exit(2);
}

const username = usernameRaw.replace(/^@/, "");

async function save(media: StoryMedia, id: number) {
  const outDir = process.env.OUT_DIR ?? "/tmp/opencode";
  await mkdir(outDir, { recursive: true });
  const out = join(outDir, `story-${username}-${id}.${media.isVideo ? "mp4" : "jpg"}`);
  await writeFile(out, media.buffer);
  console.log(
    `OK: story ${id} — ${media.buffer.length} bytes (${media.isVideo ? "video" : "photo"})` +
      (media.caption ? `, caption "${media.caption.slice(0, 60)}"` : ", no caption") +
      ` -> ${out}`
  );
}

try {
  if (idRaw) {
    const id = Number(idRaw);
    await save(await fetchStory(username, id), id);
  } else {
    const items = await fetchActive(username);
    console.log(`${items.length} active story item(s) on @${username}`);
    for (const m of items) await save(m, m.id);
  }
} catch (e: any) {
  if (e instanceof UnknownUserError) console.error("UNKNOWN USER: that username doesn't exist.");
  else if (e instanceof NotFoundError)
    console.error("NOT FOUND: no active story / expired / never posted / not visible to this account.");
  else if (e instanceof ProtectedError) console.error("PROTECTED: story has noforwards set, refusing to serve it.");
  else if (e instanceof BusyError) console.error("BUSY: another fetch holds the session lock (mt:lock).");
  else if (typeof e?.seconds === "number") console.error(`FLOOD_WAIT: retry in ${e.seconds}s (cooldown written to Redis).`);
  else console.error("FAILED:", e?.errorMessage ?? e?.message ?? e);
  process.exit(1);
}

process.exit(0);
