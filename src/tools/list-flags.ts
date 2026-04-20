import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Flag } from "../client/types.js";
import { getToolContext, requireProjectId } from "./context.js";
import { toolError } from "./helpers.js";

const inputSchema = {
  project_id: z
    .string()
    .optional()
    .describe(
      "Project ID to list flags for. Defaults to the project set via `flagify projects pick` or FLAGIFY_PROJECT_ID env var.",
    ),
};

export function registerListFlags(server: McpServer): void {
  server.registerTool(
    "list_flags",
    {
      title: "List feature flags",
      description:
        "List all feature flags in the current Flagify project with their per-environment state (enabled, targeting rule count, rollout percentage). Use this when the user asks to see, browse, or audit flags in the project.",
      inputSchema,
    },
    async ({ project_id }) => {
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

      const flags = res.body;
      return {
        content: [
          {
            type: "text",
            text: renderFlagsSummary(flags, projectId),
          },
        ],
        structuredContent: { flags, projectId },
      };
    },
  );
}

function renderFlagsSummary(flags: Flag[], projectId: string): string {
  if (flags.length === 0) {
    return `Project ${projectId} has no flags yet.`;
  }
  const lines = [`${flags.length} flag(s) in project ${projectId}:`, ""];
  for (const f of flags) {
    const perEnv = f.environments ?? [];
    const envs = perEnv
      .map((e) => {
        const onoff = e.enabled ? "on" : "off";
        const rules = e.targetingRuleCount > 0 ? ` (${e.targetingRuleCount} rules)` : "";
        return `${e.environmentKey ?? e.environmentId}=${onoff}${rules}`;
      })
      .join(", ");
    const desc = f.description ? ` — ${f.description}` : "";
    lines.push(`- ${f.key} [${f.type}]${desc}`);
    if (envs) lines.push(`    ${envs}`);
  }
  return lines.join("\n");
}

