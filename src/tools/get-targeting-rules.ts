import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TargetingRule } from "../client/types.js";
import { getToolContext, requireProjectId } from "./context.js";
import { resolveFlag, toolError } from "./helpers.js";

const inputSchema = {
  flag_key: z
    .string()
    .describe("Flag key (kebab-case) or name — resolved fuzzy, case-insensitive."),
  environment: z
    .string()
    .describe("Environment key (e.g. 'development', 'staging', 'production')."),
  project_id: z
    .string()
    .optional()
    .describe("Project ID. Defaults to the project set via `flagify projects pick`."),
};

export function registerGetTargetingRules(server: McpServer): void {
  server.registerTool(
    "get_targeting_rules",
    {
      title: "Get targeting rules",
      description:
        "Fetch the ordered targeting rules for a flag in a specific environment. Each rule has a priority, match type (all/any), conditions (segment refs or attribute checks), and either a value override, rollout percentage, or variant selection. Use when the user asks who a flag targets or how a rollout is configured.",
      inputSchema,
    },
    async ({ flag_key, environment, project_id }) => {
      const ctx = await getToolContext();
      const projectId = project_id ?? requireProjectId(ctx.scope);

      const flag = await resolveFlag(ctx.client, projectId, flag_key);
      if (!flag) {
        return toolError(
          `No flag matching "${flag_key}" in project ${projectId}. Use list_flags to see available flags.`,
        );
      }

      const path =
        `/v1/projects/${encodeURIComponent(projectId)}` +
        `/flags/${encodeURIComponent(flag.key)}` +
        `/environments/${encodeURIComponent(environment)}/targeting-rules`;

      const res = await ctx.client.get<TargetingRule[]>(path, { cache: true });
      if (res.status !== 200 || !res.body) {
        return toolError(
          `Failed to get targeting rules (HTTP ${res.status}): ${res.errorMessage ?? "unknown error"}`,
        );
      }

      const rules = res.body;
      if (rules.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `Flag ${flag.key} in ${environment} has no targeting rules (evaluation falls through to the default value).`,
            },
          ],
          structuredContent: { rules: [], flag_key: flag.key, environment },
        };
      }

      const lines = [
        `${rules.length} targeting rule(s) on ${flag.key} @ ${environment}:`,
        "",
      ];
      for (const r of rules) {
        const desc = r.description ? ` — ${r.description}` : "";
        lines.push(`#${r.priority} [match=${r.matchType}]${desc}`);
        const conditions = r.conditions ?? [];
        if (conditions.length === 0) {
          lines.push(`    (malformed: no conditions — rule will never match)`);
        }
        for (const c of conditions) {
          if (c.type === "segment") {
            lines.push(`    in segment ${c.segmentId}`);
          } else {
            lines.push(
              `    ${c.attribute} ${c.operator ?? "="} ${(c.values ?? []).join(", ")}`,
            );
          }
        }
        const outcome =
          r.variantKey != null
            ? `variant=${r.variantKey}`
            : r.rolloutPercentage != null
              ? `rollout=${r.rolloutPercentage}%`
              : r.valueOverride !== undefined
                ? `value=${JSON.stringify(r.valueOverride)}`
                : "(no outcome)";
        lines.push(`    → ${outcome}`);
        lines.push("");
      }

      return {
        content: [{ type: "text", text: lines.join("\n").trimEnd() }],
        structuredContent: { rules, flag_key: flag.key, environment },
      };
    },
  );
}
