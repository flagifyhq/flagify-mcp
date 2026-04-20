import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Flag } from "../client/types.js";
import { getToolContext, requireProjectId } from "./context.js";
import { formatHttpError, resolveFlag, toolError } from "./helpers.js";

const inputSchema = {
  flag_key: z.string().describe("Flag key or name (case-insensitive)."),
  name: z.string().optional().describe("New display name."),
  description: z.string().optional().describe("New description. Pass empty string to clear."),
  default_value: z
    .unknown()
    .optional()
    .describe("New default value. Type must match the flag's type."),
  off_value: z.unknown().optional().describe("New off value."),
  project_id: z.string().optional(),
};

export function registerUpdateFlag(server: McpServer): void {
  server.registerTool(
    "update_flag",
    {
      title: "Update feature flag metadata",
      description:
        "Update a flag's name, description, default value, or off value. Does NOT change per-environment state — use toggle_flag for that, or update_targeting_rules for targeting.",
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
          `No flag matching "${input.flag_key}" in project ${projectId}.`,
        );
      }

      const body: Record<string, unknown> = {};
      if (input.name !== undefined) body.name = input.name;
      if (input.description !== undefined) body.description = input.description;
      if (input.default_value !== undefined) body.defaultValue = input.default_value;
      if (input.off_value !== undefined) body.offValue = input.off_value;

      if (Object.keys(body).length === 0) {
        return toolError("Nothing to update — provide at least one of: name, description, default_value, off_value.");
      }

      const res = await ctx.client.patch<Flag>(
        `/v1/flags/${encodeURIComponent(flag.id)}`,
        body,
      );
      if (res.status !== 200) {
        return toolError(formatHttpError("update_flag", res.status, res.errorMessage));
      }

      const updated = res.body!;
      return {
        content: [
          { type: "text", text: `Updated flag ${updated.key} (${updated.id}).` },
        ],
        structuredContent: { flag: updated },
      };
    },
  );
}
