import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TargetingRule } from "../client/types.js";
import { getToolContext, requireProjectId } from "./context.js";
import { formatHttpError, resolveFlag, toolError } from "./helpers.js";

// Discriminated union: each condition type has its own required fields. This
// prevents the LLM from producing mixed shapes like
// `{ type: "segment", attribute: "email" }` that Zod would otherwise accept
// and the API would silently drop.
const segmentCondition = z.object({
  type: z.literal("segment"),
  segmentId: z.string().describe("ID of the segment to match against."),
});

const attributeCondition = z.object({
  type: z.literal("attribute"),
  attribute: z
    .string()
    .describe("User attribute name (e.g. 'email', 'role', 'plan', 'country')."),
  operator: z
    .string()
    .describe("Match operator: equals, contains, starts_with, in, gt, lt, etc."),
  values: z
    .array(z.string())
    .min(1)
    .describe("Values to compare against. Must have at least one."),
});

const conditionSchema = z.discriminatedUnion("type", [
  segmentCondition,
  attributeCondition,
]);

const ruleSchema = z.object({
  priority: z.number().int().describe("Lower = higher priority (evaluated first)."),
  description: z.string().optional(),
  matchType: z
    .enum(["all", "any"])
    .describe("all = every condition must match; any = at least one."),
  valueOverride: z.unknown().optional(),
  rolloutPercentage: z.number().int().min(0).max(100).optional().nullable(),
  variantKey: z.string().optional().nullable(),
  conditions: z
    .array(conditionSchema)
    .min(1, "each rule must have at least one condition — rules with no conditions never match")
    .describe("Conditions that gate this rule."),
});

const inputSchema = {
  flag_key: z.string().describe("Flag key or name — resolved fuzzy, case-insensitive."),
  environment: z.string(),
  rules: z
    .array(ruleSchema)
    .describe(
      "Full ordered list of targeting rules. This PUT replaces all existing rules for the flag in this environment — pass the complete set you want, not a partial diff.",
    ),
  project_id: z.string().optional(),
};

export function registerUpdateTargetingRules(server: McpServer): void {
  server.registerTool(
    "update_targeting_rules",
    {
      title: "Replace targeting rules for a flag in an environment",
      description:
        "Replace the full list of targeting rules for a specific flag+environment pair. Rules are evaluated in priority order (lowest first); the first match determines the value. Use get_targeting_rules first to see the current rules before replacing.",
      inputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
      },
    },
    async (input) => {
      const ctx = await getToolContext();
      const projectId = input.project_id ?? requireProjectId(ctx.scope);

      const flag = await resolveFlag(ctx.client, projectId, input.flag_key);
      if (!flag) {
        return toolError(
          `No flag matching "${input.flag_key}" in project ${projectId}. Use list_flags to see available flags.`,
        );
      }

      const path =
        `/v1/projects/${encodeURIComponent(projectId)}` +
        `/flags/${encodeURIComponent(flag.key)}` +
        `/environments/${encodeURIComponent(input.environment)}/targeting-rules`;

      const res = await ctx.client.put<TargetingRule[]>(path, { rules: input.rules });
      if (res.status !== 200) {
        return toolError(
          formatHttpError("update_targeting_rules", res.status, res.errorMessage),
        );
      }

      const saved = res.body ?? [];
      return {
        content: [
          {
            type: "text",
            text: `Replaced targeting rules on ${flag.key} @ ${input.environment}: ${saved.length} rule(s) now active.`,
          },
        ],
        structuredContent: { rules: saved },
      };
    },
  );
}
