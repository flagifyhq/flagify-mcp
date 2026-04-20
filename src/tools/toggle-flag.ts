import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FlagEnvironment } from "../client/types.js";
import { getToolContext, requireProjectId } from "./context.js";
import { formatHttpError, resolveFlag, toolError } from "./helpers.js";

const inputSchema = {
  flag_key: z
    .string()
    .describe(
      "Flag key (kebab-case) or human-readable name. Matched case-insensitively against both key and name.",
    ),
  environment: z
    .string()
    .describe("Environment key (e.g. 'development', 'staging', 'production')."),
  enabled: z
    .boolean()
    .optional()
    .describe("New enabled state. Omit to keep current state (e.g. to only change rollout/value)."),
  value_override: z
    .unknown()
    .optional()
    .describe(
      "Override the flag's default value for this environment only (typed to match the flag's type).",
    ),
  rollout_percentage: z
    .number()
    .int()
    .min(0)
    .max(100)
    .optional()
    .describe("Catch-all rollout percentage (0-100) for users not matched by any targeting rule."),
  project_id: z.string().optional(),
};

export function registerToggleFlag(server: McpServer): void {
  server.registerTool(
    "toggle_flag",
    {
      title: "Toggle feature flag in environment",
      description:
        "Enable or disable a feature flag in a specific environment, or adjust its catch-all rollout / value override. Changes take effect immediately (SDKs pick up the new state via SSE within seconds).",
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

      const body: Record<string, unknown> = {};
      if (input.enabled !== undefined) body.enabled = input.enabled;
      if (input.value_override !== undefined) body.valueOverride = input.value_override;
      if (input.rollout_percentage !== undefined) body.rolloutPercentage = input.rollout_percentage;

      if (Object.keys(body).length === 0) {
        return toolError(
          "Nothing to update — pass at least one of: enabled, value_override, rollout_percentage.",
        );
      }

      // Resolve against the live flag list so typos / human-readable names
      // fail with a clear message instead of hitting a 404 from the API.
      const flag = await resolveFlag(ctx.client, projectId, input.flag_key);
      if (!flag) {
        return toolError(
          `No flag matching "${input.flag_key}" in project ${projectId}. Use list_flags to see available flags.`,
        );
      }

      const path =
        `/v1/projects/${encodeURIComponent(projectId)}` +
        `/flags/${encodeURIComponent(flag.key)}` +
        `/environments/${encodeURIComponent(input.environment)}`;

      const res = await ctx.client.put<FlagEnvironment>(path, body);
      if (res.status !== 200 || !res.body) {
        return toolError(formatHttpError("toggle_flag", res.status, res.errorMessage));
      }

      const changes: string[] = [];
      if (input.enabled !== undefined) changes.push(input.enabled ? "enabled=ON" : "enabled=OFF");
      if (input.rollout_percentage !== undefined) changes.push(`rollout=${input.rollout_percentage}%`);
      if (input.value_override !== undefined) changes.push(`valueOverride=${JSON.stringify(input.value_override)}`);

      return {
        content: [
          {
            type: "text",
            text: `Updated ${flag.key} @ ${input.environment}: ${changes.join(", ")}.`,
          },
        ],
        structuredContent: { flagEnvironment: res.body },
      };
    },
  );
}
