# Changelog

All notable changes to `@flagify/mcp` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] — 2026-04-20

First public release. Stdio MCP server with 12 tools for managing Flagify feature flags from Claude Desktop, Claude Code, Cursor, Zed, Windsurf, and any MCP-compatible host.

### Added

- **Read-only tools** (6): `list_flags`, `get_flag`, `list_environments`, `list_segments`, `get_targeting_rules`, `get_audit_log`.
- **Mutation tools** (5): `create_flag`, `update_flag`, `delete_flag` (archive), `toggle_flag`, `update_targeting_rules`. All annotated with `destructiveHint: true` so hosts can highlight them in consent prompts.
- **Health** (1): `ping` returns server version.
- Auth via JWT access token, shared with the `flagify` CLI (reads `~/.flagify/config.json`). API keys (`pk_*`/`sk_*`) are not accepted — use `flagify login` first.
- Automatic JWT refresh on 401 with rotated tokens persisted back to `~/.flagify/config.json`.
- `X-Flagify-Source: mcp` header on all requests so the API audit log can distinguish MCP-originated changes.
- Scope resolution (workspace + project) from env vars (`FLAGIFY_WORKSPACE_ID`, `FLAGIFY_PROJECT_ID`) or CLI config defaults.
- Browser-loopback login module (port of the CLI's `flagify login`) — ready for a future `login` tool.
