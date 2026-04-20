import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Segment } from "../client/types.js";
import { getToolContext, requireProjectId } from "./context.js";

const inputSchema = {
  project_id: z
    .string()
    .optional()
    .describe("Project ID. Defaults to the project set via `flagify projects pick`."),
};

export function registerListSegments(server: McpServer): void {
  server.registerTool(
    "list_segments",
    {
      title: "List user segments",
      description:
        "List reusable user segments (groups of users by attribute rules, e.g. 'Pro Users', 'Beta Testers') defined in the current project. Segments are referenced by targeting rules to gate flags to specific cohorts.",
      inputSchema,
    },
    async ({ project_id }) => {
      const ctx = await getToolContext();
      const projectId = project_id ?? requireProjectId(ctx.scope);

      const res = await ctx.client.get<Segment[]>(
        `/v1/projects/${encodeURIComponent(projectId)}/segments`,
        { cache: true },
      );
      if (res.status !== 200 || !res.body) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Failed to list segments (HTTP ${res.status}): ${res.errorMessage ?? "unknown error"}`,
            },
          ],
        };
      }

      const segs = res.body;
      if (segs.length === 0) {
        return {
          content: [{ type: "text", text: `No segments defined in project ${projectId}.` }],
          structuredContent: { segments: [], projectId },
        };
      }

      const lines = [`${segs.length} segment(s) in project ${projectId}:`, ""];
      for (const s of segs) {
        const desc = s.description ? ` — ${s.description}` : "";
        lines.push(`- ${s.key} (${s.name})${desc}`);
        lines.push(`    match: ${s.matchType}, ${s.rules.length} rule(s)`);
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: { segments: segs, projectId },
      };
    },
  );
}
