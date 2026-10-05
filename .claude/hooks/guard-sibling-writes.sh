#!/usr/bin/env bash
# PreToolUse (Write|Edit|MultiEdit|NotebookEdit) hook, local to nawara-frontend (not part of ai-standard).
# Denies a file write whose fully resolved target is outside this repository but inside its parent folder: a write
# through one of the ai-standard symlinks (CONTRIBUTING.md, docs/README.md, .claude/commands/*, …) would edit
# ../ai-standard for every Nawara project, and the sibling repositories are read-only from here (CLAUDE.md).
# Writes elsewhere (inside this repository, temporary/scratch directories) are left alone.
set -euo pipefail

input="$(cat)"
file_path="$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty')"
[[ -z "$file_path" ]] && exit 0

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
parent="$(dirname "$repo")"

if [[ "$file_path" != /* ]]; then
  cwd="$(printf '%s' "$input" | jq -r '.cwd // empty')"
  file_path="${cwd:-$repo}/$file_path"
fi
resolved="$(realpath -m -- "$file_path")"

if [[ "$resolved" == "$parent"/* && "$resolved" != "$repo" && "$resolved" != "$repo"/* ]]; then
  reason="Blocked: ${file_path} resolves to ${resolved}, outside nawara-frontend. ai-standard symlinks and sibling repositories are read-only from this repository (CLAUDE.md). A shared-standard change is an owner action in ../ai-standard itself."
  jq -n --arg reason "$reason" \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
fi
