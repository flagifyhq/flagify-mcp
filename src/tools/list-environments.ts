import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Environment } from "../client/types.js";
import { getToolContext, requireProjectId } from "./context.js";

const inputSchema = {
  project_id: z
    .string()
    .optional()
    .describe("Project ID. Defaults to the project set via `flagify projects pick`."),
};

export function registerListEnvironments(server: McpServer): void {
  server.registerTool(
    "list_environments",
    {
      title: "List environments",
      description:
        "List the environments (e.g. development, staging, production) configured in the current project. Use when the user asks about environments or needs to pick one for a toggle/targeting operation.",
      inputSchema,
    },
    async ({ project_id }) => {
      const ctx = await getToolContext();
      const projectId = project_id ?? requireProjectId(ctx.scope);

      const res = await ctx.client.get<Environment[]>(
        `/v1/projects/${encodeURIComponent(projectId)}/environments`,
        { cache: true },
      );
      if (res.status !== 200 || !res.body) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Failed to list environments (HTTP ${res.status}): ${res.errorMessage ?? "unknown error"}`,
            },
          ],
        };
      }

      const envs = res.body;
      const lines = [`${envs.length} environment(s) in project ${projectId}:`, ""];
      for (const e of envs) {
        lines.push(`- ${e.key} — ${e.name}${e.color ? ` (color ${e.color})` : ""}`);
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: { environments: envs, projectId },
      };
    },
  );
}
