import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { configPath, type StoreV2 } from "../auth/config.js";
import {
  getToolContext,
  resetToolContext,
  UnknownProfileError,
  MissingAuthError,
} from "./context.js";

async function withTempHome(run: (home: string) => Promise<void>): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "flagify-mcp-ctx-"));
  const prevHome = process.env.HOME;
  process.env.HOME = dir;
  try {
    await run(dir);
  } finally {
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function writeStoreFile(contents: unknown): Promise<void> {
  const target = configPath();
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  await fs.writeFile(target, JSON.stringify(contents, null, 2), { mode: 0o600 });
}

function clearEnv(): void {
  for (const key of [
    "FLAGIFY_PROFILE",
    "FLAGIFY_ACCESS_TOKEN",
    "FLAGIFY_REFRESH_TOKEN",
    "FLAGIFY_WORKSPACE",
    "FLAGIFY_WORKSPACE_ID",
    "FLAGIFY_PROJECT",
    "FLAGIFY_PROJECT_ID",
    "FLAGIFY_ENVIRONMENT",
    "FLAGIFY_API_URL",
  ]) {
    delete process.env[key];
  }
}

function reset(): void {
  clearEnv();
  resetToolContext();
}

describe("getToolContext — pin-at-start", () => {
  beforeEach(reset);
  afterEach(reset);

  it("pins the current profile of a v2 store", async () => {
    await withTempHome(async () => {
      const store: StoreV2 = {
        version: 2,
        current: "work",
        accounts: {
          work: {
            accessToken:
              "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.sig",
            apiUrl: "http://127.0.0.1:1",
            defaults: { workspaceId: "ws_1", projectId: "pr_1", environment: "development" },
          },
        },
      };
      await writeStoreFile(store);

      const ctx = await getToolContext();
      assert.equal(ctx.profile, "work");
      assert.equal(ctx.ephemeral, false);
      assert.equal(ctx.scope.workspaceId, "ws_1");
      assert.equal(ctx.scope.projectId, "pr_1");
      assert.equal(ctx.apiUrl, "http://127.0.0.1:1");
    });
  });

  it("honors FLAGIFY_PROFILE at startup over current", async () => {
    await withTempHome(async () => {
      await writeStoreFile({
        version: 2,
        current: "work",
        accounts: {
          work: { accessToken: "eyJ1.e30.s" },
          personal: {
            accessToken: "eyJ2.e30.s",
            defaults: { projectId: "pr_personal" },
          },
        },
      });

      process.env.FLAGIFY_PROFILE = "personal";
      const ctx = await getToolContext();
      assert.equal(ctx.profile, "personal");
      assert.equal(ctx.scope.projectId, "pr_personal");
    });
  });

  it("throws UnknownProfileError when FLAGIFY_PROFILE points to a missing profile", async () => {
    await withTempHome(async () => {
      await writeStoreFile({
        version: 2,
        current: "work",
        accounts: { work: { accessToken: "eyJ1.e30.s" } },
      });

      process.env.FLAGIFY_PROFILE = "ghost";
      await assert.rejects(getToolContext(), (err) => err instanceof UnknownProfileError);
    });
  });

  it("uses env token ephemerally (no profile pinning, no persistence wiring)", async () => {
    await withTempHome(async () => {
      await writeStoreFile({
        version: 2,
        current: "work",
        accounts: { work: { accessToken: "eyJ1.e30.s", apiUrl: "http://stored" } },
      });

      process.env.FLAGIFY_ACCESS_TOKEN = "eyJenv.e30.s";
      const ctx = await getToolContext();
      assert.equal(ctx.ephemeral, true);
      assert.equal(ctx.profile, "");
      // apiUrl still resolved from the store for scope defaults.
      assert.equal(ctx.apiUrl, "http://stored");
    });
  });

  it("fails MissingAuthError when a v1 store has no token and no env token is set", async () => {
    await withTempHome(async () => {
      await writeStoreFile({}); // empty v1
      await assert.rejects(getToolContext(), (err) => err instanceof MissingAuthError);
    });
  });

  it("is pinned after first call — a later HOME or env change does not flip the account", async () => {
    await withTempHome(async (home) => {
      await writeStoreFile({
        version: 2,
        current: "work",
        accounts: {
          work: { accessToken: "eyJwork.e30.s" },
          personal: { accessToken: "eyJpersonal.e30.s" },
        },
      });

      const first = await getToolContext();
      assert.equal(first.profile, "work");

      // Flip `current` on disk (simulating `flagify auth switch personal`).
      await writeStoreFile({
        version: 2,
        current: "personal",
        accounts: {
          work: { accessToken: "eyJwork.e30.s" },
          personal: { accessToken: "eyJpersonal.e30.s" },
        },
      });
      // Even with FLAGIFY_PROFILE now requesting personal, the cached context
      // must not change without resetToolContext().
      process.env.FLAGIFY_PROFILE = "personal";

      const second = await getToolContext();
      assert.equal(second.profile, "work", "pin-at-start must survive external changes");

      // Confirm the home path is unchanged in the test env.
      assert.ok(home.length > 0);
    });
  });
});
