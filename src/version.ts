// Single source of truth for the package version. Kept in its own module
// so the HTTP client's User-Agent can't drift from what the server reports
// on `initialize`. Bumped in lockstep with package.json.
export const PACKAGE_VERSION = "0.1.0";
