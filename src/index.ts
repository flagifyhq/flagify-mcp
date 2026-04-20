#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerListFlags } from "./tools/list-flags.js";
import { registerGetFlag } from "./tools/get-flag.js";
import { registerListEnvironments } from "./tools/list-environments.js";
import { registerListSegments } from "./tools/list-segments.js";
import { registerGetTargetingRules } from "./tools/get-targeting-rules.js";
import { registerGetAuditLog } from "./tools/get-audit-log.js";
import { registerCreateFlag } from "./tools/create-flag.js";
import { registerUpdateFlag } from "./tools/update-flag.js";
import { registerDeleteFlag } from "./tools/delete-flag.js";
import { registerToggleFlag } from "./tools/toggle-flag.js";
import { registerUpdateTargetingRules } from "./tools/update-targeting-rules.js";
import { PACKAGE_VERSION } from "./version.js";

async function main(): Promise<void> {
  const server = new McpServer({
    name: "flagify",
    version: PACKAGE_VERSION,
  });

  server.registerTool(
    "ping",
    {
      title: "Ping",
      description:
        "Health check. Returns 'pong' with the MCP server version. Use this to confirm the Flagify MCP server is reachable from the host.",
      inputSchema: {},
    },
    async () => ({
      content: [
        { type: "text", text: `pong (flagify-mcp v${PACKAGE_VERSION})` },
      ],
    }),
  );

  // Read-only
  registerListFlags(server);
  registerGetFlag(server);
  registerListEnvironments(server);
  registerListSegments(server);
  registerGetTargetingRules(server);
  registerGetAuditLog(server);

  // Mutations (destructiveHint: true)
  registerCreateFlag(server);
  registerUpdateFlag(server);
  registerDeleteFlag(server);
  registerToggleFlag(server);
  registerUpdateTargetingRules(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`flagify-mcp fatal: ${String(err)}\n`);
  process.exit(1);
});
