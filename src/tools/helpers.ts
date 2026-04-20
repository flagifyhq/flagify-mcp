import type { Flag } from "../client/types.js";
import type { FlagifyApiClient } from "../client/flagify-api.js";

/**
 * Resolve a user-supplied flag key or name to the underlying Flag record. The
 * API has no "find by key" endpoint so we list and filter client-side.
 *
 * **Always bypasses the 30s GET cache.** Mutations that target the resolved
 * `flag.id` must not act on stale state — if the user renamed or archived the
 * flag elsewhere (console, CLI) within the last 30s, the cached list would
 * still show it, and we'd issue a mutation against an ID the user doesn't
 * expect to still exist. An extra list call per mutation is cheap.
 *
 * Matches case-insensitively against both key and name so the LLM can pass
 * "Dark Mode" or "dark-mode" interchangeably.
 */
export async function resolveFlag(
  client: FlagifyApiClient,
  projectId: string,
  flagKeyOrName: string,
): Promise<Flag | null> {
  const res = await client.get<Flag[]>(
    `/v1/projects/${encodeURIComponent(projectId)}/flags`,
    { cache: false },
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
