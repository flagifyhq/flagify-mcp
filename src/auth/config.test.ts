import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  configPath,
  loadLoadedConfig,
  persistRotatedTokensForProfile,
  pickProfileForStore,
  type StoreV2,
} from "./config.js";

async function withTempHome(run: (home: string) => Promise<void>): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "flagify-mcp-cfg-"));
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

async function readStoreFile(): Promise<unknown> {
  return JSON.parse(await fs.readFile(configPath(), "utf8")) as unknown;
}

// Ensure pickProfileForStore and loadLoadedConfig honor the env exactly.
function clearProfileEnv(): void {
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

describe("loadLoadedConfig", () => {
  beforeEach(clearProfileEnv);
  afterEach(clearProfileEnv);

  it("projects the current profile from a v2 store", async () => {
    await withTempHome(async () => {
      const store: StoreV2 = {
        version: 2,
        current: "work",
        accounts: {
          work: {
            accessToken: "wt",
            refreshToken: "wr",
            apiUrl: "https://api.flagify.dev",
            user: { email: "mario@acme.com" },
            defaults: { workspaceId: "ws_1", projectId: "pr_1", environment: "development" },
          },
          personal: {
            accessToken: "pt",
            defaults: { workspaceId: "ws_p", projectId: "pr_p" },
          },
        },
      };
      await writeStoreFile(store);

      const loaded = await loadLoadedConfig();
      assert.equal(loaded.schema, 2);
      assert.equal(loaded.profile, "work");
      assert.equal(loaded.config.accessToken, "wt");
      assert.equal(loaded.config.workspaceId, "ws_1");
      assert.equal(loaded.config.environment, "development");
    });
  });

  it("honors FLAGIFY_PROFILE to pick a non-current profile", async () => {
    await withTempHome(async () => {
      await writeStoreFile({
        version: 2,
        current: "work",
        accounts: {
          work: { accessToken: "wt" },
          personal: { accessToken: "pt" },
        },
      });

      process.env.FLAGIFY_PROFILE = "personal";
      const loaded = await loadLoadedConfig();
      assert.equal(loaded.profile, "personal");
      assert.equal(loaded.config.accessToken, "pt");
    });
  });

  it("surfaces an empty config when FLAGIFY_PROFILE requests a missing profile (caller fails loud)", async () => {
    await withTempHome(async () => {
      await writeStoreFile({
        version: 2,
        current: "work",
        accounts: { work: { accessToken: "wt" } },
      });

      process.env.FLAGIFY_PROFILE = "ghost";
      const loaded = await loadLoadedConfig();
      assert.equal(loaded.schema, 2);
      assert.equal(loaded.profile, "ghost");
      assert.equal(loaded.config.accessToken, undefined);
    });
  });

  it("reads v1 flat shape unchanged", async () => {
    await withTempHome(async () => {
      await writeStoreFile({
        accessToken: "tk",
        refreshToken: "rt",
        apiUrl: "http://localhost:7070",
        projectId: "pr_1",
      });
      const loaded = await loadLoadedConfig();
      assert.equal(loaded.schema, 1);
      assert.equal(loaded.profile, "");
      assert.equal(loaded.config.accessToken, "tk");
      assert.equal(loaded.config.projectId, "pr_1");
    });
  });

  it("returns an empty v1 projection when the file does not exist", async () => {
    await withTempHome(async () => {
      const loaded = await loadLoadedConfig();
      assert.equal(loaded.schema, 1);
      assert.equal(loaded.profile, "");
      assert.deepEqual(loaded.config, {});
    });
  });

  it("falls back to the sole account when current is missing", async () => {
    await withTempHome(async () => {
      await writeStoreFile({
        version: 2,
        // no `current`
        accounts: { solo: { accessToken: "st" } },
      });
      const loaded = await loadLoadedConfig();
      assert.equal(loaded.profile, "solo");
      assert.equal(loaded.config.accessToken, "st");
    });
  });
});

describe("pickProfileForStore", () => {
  beforeEach(clearProfileEnv);
  afterEach(clearProfileEnv);

  it("prefers FLAGIFY_PROFILE over current", () => {
    process.env.FLAGIFY_PROFILE = "personal";
    const picked = pickProfileForStore({
      version: 2,
      current: "work",
      accounts: { work: {}, personal: {} },
    });
    assert.equal(picked, "personal");
  });

  it("returns '' when multiple accounts and no signal", () => {
    const picked = pickProfileForStore({
      version: 2,
      accounts: { work: {}, personal: {} },
    });
    assert.equal(picked, "");
  });
});

describe("persistRotatedTokensForProfile", () => {
  beforeEach(clearProfileEnv);
  afterEach(clearProfileEnv);

  it("writes into the captured v2 profile without touching siblings", async () => {
    await withTempHome(async () => {
      await writeStoreFile({
        version: 2,
        current: "work",
        accounts: {
          work: { accessToken: "wt-old", refreshToken: "wr-old" },
          personal: { accessToken: "pt", refreshToken: "pr" },
        },
      });

      await persistRotatedTokensForProfile("work", 2, "wt-new", "wr-new");

      const written = (await readStoreFile()) as StoreV2;
      assert.equal(written.accounts!.work.accessToken, "wt-new");
      assert.equal(written.accounts!.work.refreshToken, "wr-new");
      assert.equal(written.accounts!.personal.accessToken, "pt", "sibling must be untouched");
      assert.equal(written.current, "work", "current must not flip");
    });
  });

  it("is a no-op when the captured profile was removed mid-flight", async () => {
    await withTempHome(async () => {
      await writeStoreFile({
        version: 2,
        current: "personal",
        accounts: { personal: { accessToken: "pt" } },
      });

      await persistRotatedTokensForProfile("work", 2, "wt-new", "wr-new");

      const written = (await readStoreFile()) as StoreV2;
      assert.equal(written.accounts!.work, undefined, "deleted profile must not resurrect");
      assert.equal(written.accounts!.personal.accessToken, "pt");
    });
  });

  it("writes back v1 flat shape when schema=1", async () => {
    await withTempHome(async () => {
      await writeStoreFile({
        accessToken: "tk-old",
        refreshToken: "rt-old",
        apiUrl: "http://localhost:7070",
      });

      await persistRotatedTokensForProfile("", 1, "tk-new", "rt-new");

      const written = (await readStoreFile()) as Record<string, unknown>;
      assert.equal(written.accessToken, "tk-new");
      assert.equal(written.refreshToken, "rt-new");
      assert.equal(written.apiUrl, "http://localhost:7070", "existing fields must be preserved");
    });
  });
});
