#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const PACKAGE_VERSION = "0.0.1";

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
        {
          type: "text",
          text: `pong (flagify-mcp v${PACKAGE_VERSION})`,
        },
      ],
    }),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`flagify-mcp fatal: ${String(err)}\n`);
  process.exit(1);
});
