// Helpers for verifying that the HappyVertical MCP server pins in `.mcp.json`
// match the pnpm catalog. Extracted from check-dependencies.mjs so the drift
// guard can be unit-tested without touching the real workspace files.

/**
 * Parse `@happyvertical/*` versions from the `catalog:` block ONLY.
 *
 * `pnpm-workspace.yaml` repeats `'@happyvertical/x': <version>` under both
 * `catalog:` and `overrides:`. The catalog is the single source of truth for
 * MCP pins, so scanning the whole file would let a later `overrides:` entry
 * shadow the catalog value (last-wins) and approve a drifted pin during a bump
 * where the two temporarily diverge. Reading just the catalog block avoids that.
 *
 * @param {string} workspaceText - contents of pnpm-workspace.yaml
 * @returns {Map<string, string>} package name -> catalog version
 */
export function extractCatalogVersions(workspaceText) {
  const lines = workspaceText.split("\n");
  const start = lines.findIndex((line) => line.replace(/\s+$/u, "") === "catalog:");
  const versions = new Map();
  if (start === -1) {
    return versions;
  }

  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "" || line.trimStart().startsWith("#")) {
      continue;
    }
    // A non-indented line ends the catalog block (next top-level key).
    if (!/^\s/u.test(line)) {
      break;
    }
    const match = line.match(/^\s+'(@happyvertical\/[^']+)':\s*([^\s#]+)/u);
    if (match) {
      versions.set(match[1], match[2]);
    }
  }

  return versions;
}

/**
 * Find issues with the `@happyvertical/*` version pins in `.mcp.json` relative
 * to the catalog. Returns an array of human-readable problems (empty = OK).
 *
 * @param {string} mcpText - contents of .mcp.json
 * @param {Map<string, string>} catalogVersions - from extractCatalogVersions
 * @returns {string[]}
 */
export function findMcpPinIssues(mcpText, catalogVersions) {
  const issues = [];
  const pins = Array.from(mcpText.matchAll(/(@happyvertical\/[a-z0-9-]+)@(\d+\.\d+\.\d+)/gu));
  if (pins.length === 0) {
    issues.push(".mcp.json must pin HappyVertical MCP packages by version.");
    return issues;
  }

  for (const [, name, version] of pins) {
    const catalogVersion = catalogVersions.get(name);
    if (!catalogVersion) {
      issues.push(`.mcp.json pins ${name}@${version} but the catalog has no entry for ${name}.`);
    } else if (catalogVersion !== version) {
      issues.push(
        `.mcp.json pins ${name}@${version} but the catalog says ${catalogVersion}. Keep them in sync.`,
      );
    }
  }

  return issues;
}
