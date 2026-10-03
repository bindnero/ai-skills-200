/**
 * Single source of truth for install targets. Imported by install.mjs (to
 * install) and catalog.mjs (to document), so a path is never written twice.
 *
 * `dir` resolves against the project root; `globalDir` against the home
 * directory when --global is passed. `~` is expanded at runtime.
 * Paths verified against each tool's documented skill locations — see
 * docs/10-install-targets.md for the evidence and per-tool notes.
 */
export const TARGETS = {
  agents: {
    label: "Agent Skills standard (.agents/skills) — Antigravity, Antigravity CLI, Codex, Zed, Devin, opencode",
    dir: ".agents/skills",
    globalDir: "~/.agents/skills",
    format: "dir",
  },
  opencode: {
    label: "opencode (native)",
    dir: ".opencode/skills",
    globalDir: "~/.config/opencode/skills",
    format: "dir",
  },
  claude: {
    label: "Claude Code",
    dir: ".claude/skills",
    globalDir: "~/.claude/skills",
    format: "dir",
  },
  cursor: {
    label: "Cursor (skills)",
    dir: ".cursor/skills",
    globalDir: "~/.cursor/skills",
    format: "dir",
  },
  windsurf: {
    label: "Windsurf / Cascade (skills)",
    dir: ".windsurf/skills",
    globalDir: "~/.codeium/windsurf/skills",
    format: "dir",
  },
  codex: {
    label: "Codex CLI (skills feature)",
    dir: ".codex/skills",
    globalDir: "~/.codex/skills",
    format: "dir",
  },
  gemini: {
    label: "Antigravity — global scope",
    dir: ".gemini/config/skills",
    globalDir: "~/.gemini/config/skills",
    format: "dir",
  },
  "antigravity-cli": {
    label: "Antigravity CLI (agy) — global scope",
    dir: ".agent/skills",
    globalDir: "~/.gemini/antigravity-cli/skills",
    format: "dir",
  },
  "cursor-rules": {
    label: "Cursor (rules .mdc — always loaded, high context cost)",
    dir: ".cursor/rules",
    globalDir: "~/.cursor/rules",
    format: "mdc",
  },
  "windsurf-rules": {
    label: "Windsurf (rules — model_decision trigger)",
    dir: ".windsurf/rules",
    globalDir: "~/.codeium/windsurf/rules",
    format: "windsurf",
  },
  agentsmd: {
    label: "AGENTS.md skill index (Zed, Copilot, Aider, anything reading AGENTS.md)",
    dir: ".",
    globalDir: "~/.config/zed",
    format: "agents-md",
  },
}

export const TARGET_KEYS = Object.keys(TARGETS)
