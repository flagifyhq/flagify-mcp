import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuditEvent, AuditLogResponse } from "../client/types.js";
import { getToolContext, requireWorkspaceId } from "./context.js";

const inputSchema = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe("Max events to return (default 50, max 200)."),
  action: z
    .string()
    .optional()
    .describe("Filter by action (e.g. 'flag.toggled', 'flag.created')."),
  resource_type: z
    .string()
    .optional()
    .describe("Filter by resource type (e.g. 'flag', 'environment', 'segment')."),
  actor_user_id: z.string().optional().describe("Filter by actor user ID."),
  project_id: z
    .string()
    .optional()
    .describe("Filter by project ID. Defaults to the current project scope."),
  cursor: z.string().optional().describe("Pagination cursor from a prior call."),
  workspace_id: z
    .string()
    .optional()
    .describe("Workspace ID. Defaults to the workspace set via `flagify projects pick`."),
};

export function registerGetAuditLog(server: McpServer): void {
  server.registerTool(
    "get_audit_log",
    {
      title: "Get audit log",
      description:
        "Fetch the workspace audit log — every flag/env/segment change with actor, timestamp, and metadata. Use when the user asks what changed, who made a change, or to trace a regression. Supports filtering by action, resource type, actor, and project.",
      inputSchema,
    },
    async (input) => {
      const ctx = await getToolContext();
      const workspaceId = input.workspace_id ?? requireWorkspaceId(ctx.scope);

      const qs = new URLSearchParams();
      qs.set("limit", String(input.limit ?? 50));
      if (input.action) qs.set("action", input.action);
      if (input.resource_type) qs.set("resourceType", input.resource_type);
      if (input.actor_user_id) qs.set("actorUserId", input.actor_user_id);
      if (input.cursor) qs.set("cursor", input.cursor);
      const projectId = input.project_id ?? ctx.scope.projectId;
      if (projectId) qs.set("projectId", projectId);

      const path = `/v1/workspaces/${encodeURIComponent(workspaceId)}/audit?${qs.toString()}`;
      const res = await ctx.client.get<AuditLogResponse>(path);

      if (res.status !== 200 || !res.body) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Failed to get audit log (HTTP ${res.status}): ${res.errorMessage ?? "unknown error"}`,
            },
          ],
        };
      }

      const { events, nextCursor } = res.body;
      if (events.length === 0) {
        return {
          content: [{ type: "text", text: "No audit events match those filters." }],
          structuredContent: { events: [], nextCursor: null },
        };
      }

      const lines = [`${events.length} event(s):`, ""];
      for (const ev of events) {
        lines.push(renderEvent(ev));
      }
      if (nextCursor) {
        lines.push("");
        lines.push(`(more results — pass cursor="${nextCursor}" to continue)`);
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: { events, nextCursor: nextCursor ?? null },
      };
    },
  );
}

function renderEvent(ev: AuditEvent): string {
  const actor = ev.actorEmail ?? ev.actorId ?? ev.actorType ?? "unknown";
  const source = ev.source ? ` via ${ev.source}` : "";
  const resource = ev.resourceId
    ? `${ev.resourceType}/${ev.resourceId}`
    : ev.resourceType;
  return `  ${ev.createdAt}  ${actor}${source}  ${ev.action}  ${resource}`;
}
