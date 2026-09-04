import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { notReciprocal, normalizeRecommendations } from "./recommendations.js";
import { SubstackClient } from "./substack-client.js";
import { listRecommendations } from "./scripts/list-recommendations.js";

interface Options { baseUrl: string; cookie: string; dryRun: boolean; }

function usage(): never {
  console.error(`Usage:
  npm run dev -- remove [--dry-run]
  npm run dev -- list

Commands:
  remove                Remove recommendations that do not recommend you back (default)
  list                  Show all publications you recommend, sorted by subscriber count

Options:
  --dry-run             List candidates without deleting anything
  -h, --help            Show this help

Authentication: export SUBSTACK_COOKIE='connect.sid=...; other_cookie=...'
`);
  process.exit(0);
}

function options(argv: string[]): Options {
  const baseUrl = process.env.SUBSTACK_HOST;
  const cookie = process.env.SUBSTACK_COOKIE;
  if (!baseUrl) throw new Error("Missing SUBSTACK_HOST. Set it in .env or the environment.");
  if (!cookie) throw new Error("Missing SUBSTACK_COOKIE. Set it in .env or the environment.");
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "-h" || arg === "--help") usage();
    else throw new Error(`Unknown option: ${arg}`);
  }
  return { baseUrl: baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`, cookie, dryRun };
}

async function confirm(count: number): Promise<boolean> {
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(`Delete ${count} recommendation${count === 1 ? "" : "s"}? Type DELETE to continue: `);
    return answer.trim() === "DELETE";
  } finally { rl.close(); }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const command = argv[0] === "list" || argv[0] === "remove" ? argv.shift() : "remove";
  const opts = options(argv);
  const host = new URL(opts.baseUrl);
  if (host.protocol !== "https:") throw new Error("The publication host must use HTTPS so the session cookie is not sent in cleartext.");
  const cookie = opts.cookie.trim();
  if (!cookie.includes("=")) throw new Error("SUBSTACK_COOKIE must be a browser Cookie header, for example connect.sid=...; cookie_storage_key=...");

  if (command === "list") {
    await listRecommendations(opts.baseUrl, cookie);
    return;
  }
  const client = new SubstackClient(opts.baseUrl, cookie);
  console.log("Loading incoming and outgoing recommendations...");
  const [incomingRaw, outgoingRaw] = await Promise.all([client.incoming(), client.outgoing()]);
  const incoming = normalizeRecommendations(incomingRaw, "incoming");
  const outgoing = normalizeRecommendations(outgoingRaw, "outgoing");
  if (incoming.length !== incomingRaw.length || outgoing.length !== outgoingRaw.length) {
    throw new Error("Some API records lacked a publication ID. Refusing to calculate deletion candidates; inspect the current API response shape first.");
  }
  const candidates = notReciprocal(outgoing, incoming);
  console.log(`Found ${outgoing.length} outgoing, ${incoming.length} incoming, ${candidates.length} non-reciprocal recommendation${candidates.length === 1 ? "" : "s"}.`);
  for (const item of candidates) console.log(`- ${item.name}${item.url ? ` (${item.url})` : ""} [id ${item.publicationId}]`);
  if (!candidates.length || opts.dryRun) {
    if (opts.dryRun) console.log("Dry run: no recommendations were deleted.");
    return;
  }
  if (!await confirm(candidates.length)) {
    console.log("Cancelled. Nothing was deleted.");
    return;
  }
  let failures = 0;
  for (const item of candidates) {
    try {
      if (!item.recommendingPublicationId) throw new Error("missing recommending publication ID");
      await client.remove(item.recommendingPublicationId, item.publicationId);
      console.log(`Deleted ${item.name}.`);
    }
    catch (error) { failures++; console.error(`Failed to delete ${item.name}: ${error instanceof Error ? error.message : error}`); }
  }
  if (failures) process.exitCode = 1;
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
