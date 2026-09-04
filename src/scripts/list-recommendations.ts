import { normalizeRecommendations } from "../recommendations.js";
import { SubstackClient } from "../substack-client.js";

export async function listRecommendations(baseUrl: string, cookie: string): Promise<void> {
  const client = new SubstackClient(baseUrl, cookie);
  console.log("Loading outgoing recommendations...");
  const raw = await client.outgoing();
  const recommendations = normalizeRecommendations(raw, "outgoing");
  if (recommendations.length !== raw.length) {
    throw new Error("Some API records lacked a publication ID. Refusing to display incomplete results.");
  }
  const sorted = [...recommendations].sort((a, b) => (b.subscriberCount ?? 0) - (a.subscriberCount ?? 0));
  console.log(`You recommend ${sorted.length} publication${sorted.length === 1 ? "" : "s"}.`);
  for (const [index, item] of sorted.entries()) {
    const count = item.subscriberCount === undefined ? "unknown" : item.subscriberCount.toLocaleString();
    console.log(`${index + 1}. ${item.name} — ${count} subscribers`);
  }
}
