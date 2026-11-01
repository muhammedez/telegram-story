import { allow, floodTtl } from "../src/limits.js";

if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
  console.error("SKIP: set UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN to run this check");
  process.exit(2);
}

const user = Math.floor(Math.random() * 1e9);
const results: boolean[] = [];
for (let i = 0; i < 6; i++) results.push(await allow(user));

console.log("allow() x6 ->", results);
console.log("floodTtl() ->", await floodTtl());

const ok = results.slice(0, 5).every(Boolean) && results[5] === false;
console.log(ok ? "OK: rate limit works" : "FAIL: unexpected rate limit behaviour");
process.exit(ok ? 0 : 1);
