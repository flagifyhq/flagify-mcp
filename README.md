<p align="center">
  <a href="https://flagify.dev">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://flagify.dev/logo-white.svg" />
      <source media="(prefers-color-scheme: light)" srcset="https://flagify.dev/logo-color.svg" />
      <img alt="Flagify" src="https://flagify.dev/logo-color.svg" width="280" />
    </picture>
  </a>
</p>

<p align="center">
  <strong>Feature flags for modern teams</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@flagify/mcp"><img src="https://img.shields.io/npm/v/@flagify/mcp.svg?style=flat-square&color=0D80F9" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/@flagify/mcp"><img src="https://img.shields.io/npm/dm/@flagify/mcp.svg?style=flat-square&color=0D80F9" alt="npm downloads" /></a>
  <a href="https://github.com/flagifyhq/flagify-mcp/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@flagify/mcp.svg?style=flat-square&color=0D80F9" alt="license" /></a>
  <a href="https://github.com/flagifyhq/flagify-mcp"><img src="https://img.shields.io/github/stars/flagifyhq/flagify-mcp?style=flat-square&color=0D80F9" alt="github stars" /></a>
  <a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/MCP-compatible-8B5CF6?style=flat-square" alt="MCP compatible" /></a>
</p>

<p align="center">
  <a href="https://flagify.dev/docs">Documentation</a> &middot;
  <a href="https://flagify.dev/integrations/mcp">MCP Guide</a> &middot;
  <a href="https://github.com/flagifyhq/flagify-mcp/issues">Issues</a> &middot;
  <a href="https://flagify.dev">Website</a>
</p>

---

## Overview

Flagify's [Model Context Protocol](https://modelcontextprotocol.io) server. Lets any MCP host (Claude Desktop, Claude Code, Cursor, Zed, Windsurf) read and change your feature flags without leaving the editor.

- **Zero-config auth** -- reads the same `~/.flagify/config.json` the Flagify CLI writes on `flagify login`
- **12 tools** -- list, create, update, toggle, archive; plus environments, segments, targeting rules, and the audit log
- **Destructive mutations are tagged** with `destructiveHint: true` so hosts can flag them in their consent UI
- **Every change lands in the audit log** with `source: "mcp"`, so you can tell MCP-driven edits apart from CLI or console ones
- **Stdio only** -- nothing to host, nothing to restart

## Table of contents

- [Installation](#installation)
- [Authentication](#authentication)
- [Available tools](#available-tools)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [License](#license)

## Installation

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS (or `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "flagify": {
      "command": "npx",
      "args": ["-y", "@flagify/mcp"]
    }
  }
}
```

Fully quit Claude Desktop (`Cmd+Q`) and reopen.

### Claude Code

Drop a `.mcp.json` at the root of any project:

```json
{
  "mcpServers": {
    "flagify": {
      "command": "npx",
      "args": ["-y", "@flagify/mcp"]
    }
  }
}
```

Then run `/mcp` inside Claude Code.

### Cursor

Edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "flagify": {
      "command": "npx",
      "args": ["-y", "@flagify/mcp"]
    }
  }
}
```

### Zed

Edit `~/.config/zed/settings.json`:

```json
{
  "context_servers": {
    "flagify": {
      "command": "npx",
      "args": ["-y", "@flagify/mcp"]
    }
  }
}
```

### Windsurf

Edit `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "flagify": {
      "command": "npx",
      "args": ["-y", "@flagify/mcp"]
    }
  }
}
```

## Authentication

The server reads your JWT from `~/.flagify/config.json`. That's the same file the Flagify CLI writes, so you log in once from the CLI and the MCP picks it up.

```bash
npm install -g @flagify/cli
```

```bash
flagify login
```

```bash
flagify projects pick
```

If the access token expires, the server calls `/v1/auth/refresh` with the stored refresh token and writes the rotated pair back to the config file. You won't see a prompt, it just keeps going.

API keys (`pk_*`, `sk_*`) are rejected. Those are scoped to flag evaluation, not management, so any mutation would fail with a 403. Use the JWT flow.

## Available tools

| Tool | Description | Destructive |
|------|-------------|-------------|
| `list_flags` | List every flag in the current project with per-env state | -- |
| `get_flag` | Full detail of one flag (by key or name) | -- |
| `list_environments` | Environments configured in the project | -- |
| `list_segments` | Reusable user cohorts | -- |
| `get_targeting_rules` | Ordered rules for a flag in an environment | -- |
| `get_audit_log` | Workspace audit stream with filters + cursor pagination | -- |
| `create_flag` | Create a new flag (kebab-case key enforced) | -- |
| `update_flag` | Update name, description, default value, or off value | ⚠ |
| `delete_flag` | Archive a flag (soft-delete) | ⚠ |
| `toggle_flag` | Enable/disable in an env, or change rollout / value override | ⚠ |
| `update_targeting_rules` | Replace the full rule list for flag + env | ⚠ |
| `ping` | Health check -- returns server version | -- |

## Configuration

Everything below is optional. Without it, the server uses whatever `flagify login` and `flagify projects pick` put in `~/.flagify/config.json`.

| Variable | Purpose |
|----------|---------|
| `FLAGIFY_API_URL` | Override the API base URL (e.g. `http://localhost:8080` for local dev) |
| `FLAGIFY_ACCESS_TOKEN` | Skip the config file; pass a JWT directly (useful in CI) |
| `FLAGIFY_WORKSPACE_ID` | Override the default workspace |
| `FLAGIFY_PROJECT_ID` | Override the default project |

Pass them through the MCP host's config:

```json
{
  "mcpServers": {
    "flagify": {
      "command": "npx",
      "args": ["-y", "@flagify/mcp"],
      "env": {
        "FLAGIFY_PROJECT_ID": "01J...",
        "FLAGIFY_API_URL": "http://localhost:8080"
      }
    }
  }
}
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| "Could not attach to MCP server flagify" | The host's `PATH` when launched from a GUI doesn't include `npx`/`node` | Switch to absolute paths, e.g. `"command": "/opt/homebrew/bin/npx"` |
| Tool call fails with `MissingAuthError` | No `flagify login` yet | Install `@flagify/cli` and log in |
| Tool call fails with `MissingScopeError` | No default project picked | Run `flagify projects pick`, or set `FLAGIFY_PROJECT_ID` |
| HTTP 401 after the server tries to refresh | Refresh token expired too | Run `flagify login` again |
| `list_flags` returns stale data | 30-second in-memory cache (intentional) | Do a mutation (invalidates the cache) or restart the host |

### Logs

- Claude Desktop: `~/Library/Logs/Claude/mcp-server-flagify.log`
- Claude Code: shown inline in the `/mcp` view
- Raw debug: pipe a JSON-RPC frame into the binary

```bash
printf '%s\n%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | npx -y @flagify/mcp
```

## Development

```bash
git clone https://github.com/flagifyhq/flagify-mcp.git
```

```bash
cd flagify-mcp && pnpm install
```

```bash
pnpm build
```

### Useful scripts

```bash
# Build once
pnpm build
```

```bash
# Type check
pnpm lint
```

```bash
# Open the MCP Inspector against the built server
pnpm inspector
```

```bash
# Start the server directly (for piping JSON-RPC)
pnpm start
```

### Project structure

```
src/index.ts            Entry point -- registers all tools + stdio transport
src/auth/config.ts      Reads/writes ~/.flagify/config.json
src/auth/browser-login.ts   Port of `flagify login` browser-loopback flow
src/client/flagify-api.ts   HTTP client with JWT refresh + X-Flagify-Source header
src/client/types.ts     Shared API types (Flag, Environment, Segment, ...)
src/tools/context.ts    Lazy bootstrap of client + scope resolution
src/tools/*.ts          One file per MCP tool
```

## License

MIT -- see [LICENSE](./LICENSE) for details.

---

<p align="center">
  <sub>Built with care by the <a href="https://flagify.dev">Flagify</a> team</sub>
</p>
