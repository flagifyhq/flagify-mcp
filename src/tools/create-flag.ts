import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Flag, FlagType } from "../client/types.js";
import { getToolContext, requireProjectId } from "./context.js";
import { formatHttpError, toolError } from "./helpers.js";

const inputSchema = {
  key: z
    .string()
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      "Flag key must be kebab-case (lowercase letters, digits, hyphens only).",
    )
    .describe("Flag key in kebab-case (e.g. 'new-checkout-flow')."),
  name: z.string().min(1).describe("Human-readable flag name."),
  type: z
    .enum(["boolean", "string", "number", "json"])
    .describe("Flag value type."),
  description: z.string().optional(),
  default_value: z
    .unknown()
    .optional()
    .describe(
      "Default value when the flag is enabled and no targeting rule matches. Type must match `type` (boolean→true/false, number→42, string→\"abc\", json→{...}).",
    ),
  off_value: z
    .unknown()
    .optional()
    .describe(
      "Value returned when the flag is disabled in an environment. Same type rules as default_value.",
    ),
  project_id: z.string().optional(),
};

export function registerCreateFlag(server: McpServer): void {
  server.registerTool(
    "create_flag",
    {
      title: "Create feature flag",
      description:
        "Create a new feature flag. The flag is provisioned across all environments in the project (disabled by default, with default_value as the enabled value and off_value as the disabled value).",
      inputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (input) => {
      const ctx = await getToolContext();
      const projectId = input.project_id ?? requireProjectId(ctx.scope);

      const body: Record<string, unknown> = {
        key: input.key,
        name: input.name,
        type: input.type as FlagType,
        description: input.description ?? "",
      };
      if (input.default_value !== undefined) body.defaultValue = input.default_value;
      if (input.off_value !== undefined) body.offValue = input.off_value;

      const res = await ctx.client.post<Flag>(
        `/v1/projects/${encodeURIComponent(projectId)}/flags`,
        body,
      );
      if ((res.status !== 200 && res.status !== 201) || !res.body) {
        return toolError(formatHttpError("create_flag", res.status, res.errorMessage));
      }

      ctx.client.invalidateCache();
      const flag = res.body;
      return {
        content: [
          {
            type: "text",
            text: `Created flag ${flag.key} (${flag.id}) as ${flag.type}. Disabled in all environments — use toggle_flag to enable it.`,
          },
        ],
        structuredContent: { flag },
      };
    },
  );
}
