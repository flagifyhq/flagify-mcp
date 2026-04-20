import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TargetingRule } from "../client/types.js";
import { getToolContext, requireProjectId } from "./context.js";
import { formatHttpError, toolError } from "./helpers.js";

const conditionSchema = z.object({
  type: z.enum(["segment", "attribute"]),
  segmentId: z.string().optional(),
  attribute: z.string().optional(),
  operator: z.string().optional().describe("e.g. equals, contains, starts_with, in, gt, lt"),
  values: z.array(z.string()).optional(),
});

const ruleSchema = z.object({
  priority: z.number().int().describe("Lower = higher priority (evaluated first)."),
  description: z.string().optional(),
  matchType: z
    .enum(["all", "any"])
    .describe("all = every condition must match; any = at least one."),
  valueOverride: z.unknown().optional(),
  rolloutPercentage: z.number().int().min(0).max(100).optional().nullable(),
  variantKey: z.string().optional().nullable(),
  conditions: z.array(conditionSchema).describe("Conditions that gate this rule."),
});

const inputSchema = {
  flag_key: z.string(),
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

      const path =
        `/v1/projects/${encodeURIComponent(projectId)}` +
        `/flags/${encodeURIComponent(input.flag_key)}` +
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
            text: `Replaced targeting rules on ${input.flag_key} @ ${input.environment}: ${saved.length} rule(s) now active.`,
          },
        ],
        structuredContent: { rules: saved },
      };
    },
  );
}
