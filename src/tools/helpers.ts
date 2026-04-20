import type { Flag } from "../client/types.js";
import type { FlagifyApiClient } from "../client/flagify-api.js";

/**
 * Resolve a user-supplied flag key or name to the underlying Flag record. The
 * API has no "find by key" endpoint — we list and filter client-side (reusing
 * the 30s cache on list_flags). Matches case-insensitively against both key
 * and name so the LLM can pass "Dark Mode" or "dark-mode" interchangeably.
 */
export async function resolveFlag(
  client: FlagifyApiClient,
  projectId: string,
  flagKeyOrName: string,
): Promise<Flag | null> {
  const res = await client.get<Flag[]>(
    `/v1/projects/${encodeURIComponent(projectId)}/flags`,
    { cache: true },
  );
  if (res.status !== 200 || !res.body) return null;
  const needle = flagKeyOrName.trim().toLowerCase();
  return (
    res.body.find(
      (f) => f.key.toLowerCase() === needle || f.name.toLowerCase() === needle,
    ) ?? null
  );
}

export function toolError(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

export function formatHttpError(
  action: string,
  status: number,
  errorMessage?: string,
): string {
  return `${action} failed (HTTP ${status}): ${errorMessage ?? "unknown error"}`;
}
