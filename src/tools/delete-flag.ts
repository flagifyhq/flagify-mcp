import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getToolContext, requireProjectId } from "./context.js";
import { formatHttpError, resolveFlag, toolError } from "./helpers.js";

const inputSchema = {
  flag_key: z
    .string()
    .describe("Flag key or name (case-insensitive). The flag will be archived (soft-delete)."),
  project_id: z.string().optional(),
};

export function registerDeleteFlag(server: McpServer): void {
  server.registerTool(
    "delete_flag",
    {
      title: "Delete (archive) feature flag",
      description:
        "Archive a feature flag, removing it from evaluation in every environment. Archive is a soft-delete — the record is kept for audit, but the flag stops returning values to SDKs. Only run this after confirming the flag is no longer referenced in code.",
      inputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        // Archiving is idempotent at the state level — archiving an already-
        // archived flag leaves it archived. The API may return 404/409 the
        // second time, but the observable state doesn't change, which is
        // what the MCP spec's idempotentHint cares about.
        idempotentHint: true,
      },
    },
    async ({ flag_key, project_id }) => {
      const ctx = await getToolContext();
      const projectId = project_id ?? requireProjectId(ctx.scope);

      const flag = await resolveFlag(ctx.client, projectId, flag_key);
      if (!flag) {
        return toolError(`No flag matching "${flag_key}" in project ${projectId}.`);
      }

      const res = await ctx.client.post(
        `/v1/flags/${encodeURIComponent(flag.id)}/archive`,
      );
      if (res.status !== 200 && res.status !== 204) {
        return toolError(formatHttpError("delete_flag", res.status, res.errorMessage));
      }

      ctx.client.invalidateCache();
      return {
        content: [
          {
            type: "text",
            text: `Archived flag ${flag.key} (${flag.id}). It no longer evaluates in any environment.`,
          },
        ],
        structuredContent: { archivedFlagId: flag.id, archivedFlagKey: flag.key },
      };
    },
  );
}
