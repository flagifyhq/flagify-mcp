import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Flag } from "../client/types.js";
import { getToolContext, requireProjectId } from "./context.js";

const inputSchema = {
  flag_key: z
    .string()
    .describe(
      "Flag key (kebab-case, e.g. 'new-checkout-flow') or human-readable name. Matched case-insensitively against both key and name.",
    ),
  project_id: z
    .string()
    .optional()
    .describe(
      "Project ID. Defaults to the project set via `flagify projects pick` or FLAGIFY_PROJECT_ID.",
    ),
};

export function registerGetFlag(server: McpServer): void {
  server.registerTool(
    "get_flag",
    {
      title: "Get feature flag",
      description:
        "Fetch full details for a single feature flag by key or name: type, default/off values, per-environment enabled state, rollout percentage, targeting rule count, and variants. Use when the user asks about a specific flag ('show me the new-checkout flag', 'what's the state of dark-mode').",
      inputSchema,
    },
    async ({ flag_key, project_id }) => {
      const ctx = await getToolContext();
      const projectId = project_id ?? requireProjectId(ctx.scope);

      const res = await ctx.client.get<Flag[]>(
        `/v1/projects/${encodeURIComponent(projectId)}/flags`,
        { cache: true },
      );
      if (res.status !== 200 || !res.body) {
        return toolError(
          `Failed to list flags (HTTP ${res.status}): ${res.errorMessage ?? "unknown error"}`,
        );
      }

      const needle = flag_key.trim().toLowerCase();
      const match = res.body.find(
        (f) =>
          f.key.toLowerCase() === needle ||
          f.name.toLowerCase() === needle,
      );

      if (!match) {
        return toolError(
          `No flag found matching "${flag_key}" in project ${projectId}. Use list_flags to see available flags.`,
        );
      }

      return {
        content: [{ type: "text", text: renderFlagDetail(match) }],
        structuredContent: { flag: match },
      };
    },
  );
}

function renderFlagDetail(f: Flag): string {
  const lines: string[] = [];
  lines.push(`${f.key} — ${f.name} [${f.type}]`);
  if (f.description) lines.push(f.description);
  lines.push("");
  lines.push(`Default: ${JSON.stringify(f.defaultValue)}`);
  lines.push(`Off:     ${JSON.stringify(f.offValue)}`);
  lines.push("");
  lines.push("Environments:");
  for (const e of f.environments ?? []) {
    const onoff = e.enabled ? "ON " : "OFF";
    const rules = e.targetingRuleCount > 0 ? `, ${e.targetingRuleCount} rule(s)` : "";
    const rollout =
      e.rolloutPercentage != null && e.rolloutPercentage !== 100
        ? `, ${e.rolloutPercentage}% rollout`
        : "";
    const override =
      e.valueOverride !== undefined && e.valueOverride !== null
        ? `, override=${JSON.stringify(e.valueOverride)}`
        : "";
    lines.push(
      `  [${onoff}] ${e.environmentKey ?? e.environmentId}${rules}${rollout}${override}`,
    );
    if (e.variants?.length) {
      for (const v of e.variants) {
        lines.push(`         variant ${v.key} = ${JSON.stringify(v.value)} (weight ${v.weight})`);
      }
    }
  }
  return lines.join("\n");
}

function toolError(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}
