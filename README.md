# @flagify/mcp

Manage [Flagify](https://www.flagify.dev) feature flags from any MCP-compatible host — Claude Desktop, Claude Code, Cursor, Zed, Windsurf, or anything that speaks the [Model Context Protocol](https://modelcontextprotocol.io).

Feature flags for modern teams. AI tool ready. [flagify.dev](https://www.flagify.dev)

---

## What it gives you

12 tools that the LLM can call on your behalf:

| Tool | What it does | Destructive? |
|---|---|---|
| `list_flags` | List every flag in the current project with per-env state | — |
| `get_flag` | Full detail of one flag (by key or name) | — |
| `list_environments` | Environments configured in the project | — |
| `list_segments` | Reusable user cohorts | — |
| `get_targeting_rules` | Ordered rules for a flag in an environment | — |
| `get_audit_log` | Workspace audit stream with filters + pagination | — |
| `create_flag` | Create a new flag (kebab-case key enforced) | — |
| `update_flag` | Update name / description / default / off value | ⚠ |
| `delete_flag` | Archive (soft-delete) a flag | ⚠ |
| `toggle_flag` | Enable/disable in an env, or change rollout / override | ⚠ |
| `update_targeting_rules` | Replace the full rule list for flag+env | ⚠ |
| `ping` | Health check | — |

Destructive tools carry the MCP `annotations.destructiveHint: true` flag — good hosts highlight them in the user's consent prompt.

---

## Prerequisites

1. A Flagify account + project. Sign up free at [flagify.dev](https://www.flagify.dev).
2. The Flagify CLI:

   ```bash
   npm install -g @flagify/cli
   ```

3. Log in and pick a default project:

   ```bash
   flagify login
   ```

   ```bash
   flagify projects pick
   ```

The MCP server reads your CLI's tokens from `~/.flagify/config.json` — no extra auth step.

---

## Install + configure per host

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

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

Fully quit Claude Desktop (`Cmd+Q`) and reopen. The `flagify` server appears in the tools panel with 12 tools.

### Claude Code

Add a `.mcp.json` at the root of any project:

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

Run `/mcp` inside Claude Code — `flagify` appears with status `connected`.

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

Restart Cursor.

### Zed

Add to your Zed settings (`~/.config/zed/settings.json`) under `context_servers`:

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

---

## Environment variables (optional overrides)

All of these are optional — without them, the MCP server uses whatever `flagify login` and `flagify projects pick` wrote to `~/.flagify/config.json`.

| Variable | Purpose |
|---|---|
| `FLAGIFY_API_URL` | Override the API base URL (e.g. `http://localhost:8080` for local dev) |
| `FLAGIFY_ACCESS_TOKEN` | Skip the config file; pass a JWT directly (useful in CI) |
| `FLAGIFY_WORKSPACE_ID` | Override the default workspace |
| `FLAGIFY_PROJECT_ID` | Override the default project |

Set them in the MCP host's config:

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

---

## Auth model

- **JWT only.** The MCP server uses your user's JWT access token (refreshable) for every call. API keys (`pk_*`, `sk_*`) are not accepted — they're scoped to flag evaluation, not management.
- **Tokens are shared with the CLI** via `~/.flagify/config.json`. Run `flagify login` once, and both CLI + MCP work.
- **Automatic refresh**: on a 401, the server swaps the access token via `/v1/auth/refresh`, persists the rotated pair, and retries the call.
- **Audit tagged**: every mutation from MCP carries `X-Flagify-Source: mcp` so audit events can be filtered in the console.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "Could not attach to MCP server flagify" | Host's `PATH` doesn't include `npx`/`node` when launched from Finder/GUI | Use an absolute path: `"command": "/opt/homebrew/bin/npx"` |
| Tool call fails with *"No access token found"* | Never ran `flagify login` | Install `@flagify/cli` and log in |
| Tool call fails with *"No projectId found"* | Didn't pick a default project | `flagify projects pick`, or set `FLAGIFY_PROJECT_ID` |
| HTTP 401 persists after refresh | Refresh token expired | `flagify login` again |
| `list_flags` returns stale data | 30s in-memory cache (intentional) | Call a mutation (invalidates) or restart the MCP host |

### Logs

- **Claude Desktop**: `~/Library/Logs/Claude/mcp-server-flagify.log`
- **Claude Code**: emitted to the session `/mcp` view.
- **Raw debug**: run `node $(npm root -g)/@flagify/mcp/dist/index.js` and pipe in a JSON-RPC `tools/list` to verify the binary independently.

---

## Contributing

Source at [github.com/flagifyhq/flagify-mcp](https://github.com/flagifyhq/flagify-mcp). Bug reports and PRs welcome. See [CHANGELOG.md](./CHANGELOG.md) for release history.

## License

MIT — see [LICENSE](./LICENSE).
