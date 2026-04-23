# Changelog

All notable changes to `@flagify/mcp` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0](https://github.com/flagifyhq/flagify-mcp/releases/tag/v0.2.0) — 2026-04-23

### Added

- **Multi-account profile support.** The server now reads both the v1 (`token` field) and v2 (multi-profile store) `~/.flagify/config.json` formats, so users who upgraded the CLI to v2.0.0 are supported without any manual migration (#2).
- **`FLAGIFY_PROFILE` env var.** Set `FLAGIFY_PROFILE=<name>` in the host config to pin the server to a specific named profile instead of the currently active one (#2).
- **Pin-at-start.** The active profile is resolved and locked when the MCP server initializes. Mid-session profile changes (e.g. `flagify auth switch`) do not affect an already-running server (#2).
- **Rotation callback.** When the JWT access token is refreshed on a 401, the new token is persisted back to the correct profile slot in the v2 store (or the `token` field in v1), keeping the CLI and MCP in sync (#2).
- **Dockerfile** for Glama MCP directory verification (#2).

## [0.1.0] — 2026-04-20

First public release. Stdio MCP server with 12 tools for managing Flagify feature flags from Claude Desktop, Claude Code, Cursor, Zed, Windsurf, and any MCP-compatible host.

### Added

- **Read-only tools** (6): `list_flags`, `get_flag`, `list_environments`, `list_segments`, `get_targeting_rules`, `get_audit_log`.
- **Mutation tools** (5): `create_flag`, `update_flag`, `delete_flag` (archive), `toggle_flag`, `update_targeting_rules`. All annotated with `destructiveHint: true` so hosts can highlight them in consent prompts.
- **Health** (1): `ping` returns server version.
- Auth via JWT access token, shared with the `flagify` CLI (reads `~/.flagify/config.json`). API keys (`pk_*`/`sk_*`) are not accepted — use `flagify auth login` first.
- Automatic JWT refresh on 401 with rotated tokens persisted back to `~/.flagify/config.json`.
- `X-Flagify-Source: mcp` header on all requests so the API audit log can distinguish MCP-originated changes.
- Scope resolution (workspace + project) from env vars (`FLAGIFY_WORKSPACE_ID`, `FLAGIFY_PROJECT_ID`) or CLI config defaults.
- Browser-loopback login module (port of the CLI's `flagify auth login`) — kept in-tree as `@internal` for a future `login` tool; not wired to any V1 tool.

### Hardening (from the pre-release review)

- `resolveFlag` bypasses the 30-second GET cache so mutations never act on a stale `flag.id` after a concurrent rename/archive in the console or CLI.
- `toggle_flag`, `get_targeting_rules`, and `update_targeting_rules` now resolve the flag by key or name up-front, so typos and display names fail with "no flag matching 'X'" instead of a raw 404 from the API.
- Targeting rule conditions use `z.discriminatedUnion` — the LLM can't mix `type: "segment"` with `attribute`/`operator`/`values` anymore; Zod rejects the shape.
- Success paths now gate on `res.body` alongside the status code, so a future empty-body 2xx can't `TypeError`.
- API keys (`pk_*`/`sk_*`) are rejected at bootstrap with a clear message instead of producing a confusing 403 on the first mutation.
- Error messages returned to the host are scrubbed for `Bearer …`, `Authorization:` headers, and anything that looks like an API key.
- `delete_flag` annotated `idempotentHint: true` (archiving twice leaves observable state unchanged).
- `get_audit_log` exposes a `source` filter so users can ask "what did MCP change today?".
- Release workflow runs the MCP conformance smoke before `npm publish`, so a regressed `initialize`/`tools/list` can't reach the registry.
