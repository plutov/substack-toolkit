export interface Recommendation {
  publicationId: string;
  recommendingPublicationId?: string;
  name: string;
  count?: number;
  subscriberCount?: number;
  url?: string;
  raw: unknown;
}

const ID_KEYS = ["publication_id", "publicationId"];

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function publicationObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function findPublication(value: unknown): Record<string, unknown> | undefined {
  const object = publicationObject(value);
  if (!object) return undefined;
  for (const key of ["publication", "recommended_publication", "recommendedPublication", "to_publication", "from_publication"]) {
    const candidate = publicationObject(object[key]);
    if (candidate) return candidate;
  }
  return object;
}

function findId(object: Record<string, unknown>): string | undefined {
  for (const key of ID_KEYS) {
    const id = stringValue(object[key]);
    if (id) return id;
  }
  return undefined;
}

function findName(object: Record<string, unknown>): string {
  for (const key of ["name", "publication_name", "publicationName", "title", "domain", "subdomain"]) {
    if (typeof object[key] === "string" && object[key]) return object[key] as string;
  }
  return "(unnamed publication)";
}

function findUrl(object: Record<string, unknown>): string | undefined {
  for (const key of ["url", "publication_url", "publicationUrl", "domain", "subdomain"]) {
    if (typeof object[key] === "string" && object[key]) return object[key] as string;
  }
  return undefined;
}

export function normalizeRecommendations(items: unknown[], direction: "incoming" | "outgoing"): Recommendation[] {
  const result: Recommendation[] = [];
  for (const item of items) {
    const object = publicationObject(item);
    if (!object) continue;
    const publication = direction === "incoming"
      ? publicationObject(object.source_pub) ?? findPublication(item)
      : publicationObject(object.target_pub) ?? findPublication(item);
    if (!publication) continue;
    const explicitId = direction === "incoming" ? object.publication_id : object.target_publication_id;
    const publicationId = stringValue(explicitId) ?? findId(publication);
    if (!publicationId) continue;
    result.push({
      publicationId,
      recommendingPublicationId: direction === "outgoing" ? stringValue(object.publication_id) : undefined,
      name: findName(publication),
      count: typeof object.xp_signups === "number" ? object.xp_signups : undefined,
      subscriberCount: parseSubscriberCount(publication),
      url: findUrl(publication),
      raw: item,
    });
  }
  return result;
}

function parseSubscriberCount(publication: Record<string, unknown>): number | undefined {
  const value = publication.freeSubscriberCount;
  if (typeof value === "number") return value;
  if (typeof value !== "string") return undefined;
  const digits = value.replace(/[^0-9]/g, "");
  return digits ? Number(digits) : undefined;
}

export function notReciprocal(outgoing: Recommendation[], incoming: Recommendation[]): Recommendation[] {
  const incomingIds = new Set(incoming.map((item) => item.publicationId));
  return outgoing.filter((item) => !incomingIds.has(item.publicationId));
}
