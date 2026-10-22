---
name: read-agents
description: >-
  Reads erp-server and erp-app AGENTS.md with the Read tool as the first action
  before any other work. Use at the start of every implementation, fix, review,
  or feature task in this workspace, or when the user asks to follow AGENTS.md,
  project conventions, or agent instructions.
---

# Read AGENTS.md first

Before exploring code, planning, or making changes, read both agent instruction files with the Read tool.

Do this even if `AGENTS.md` was already injected as a workspace rule. The on-disk files are the source of truth.

## Files to read (first tool calls)

1. `AGENTS.md` (this repo: erp-server)
2. `../erp-app/AGENTS.md` (sibling frontend)

Use the Read tool on the full files. Do not grep, skim a section, or summarize them instead of reading.

## Then continue

Follow those rules for the rest of the turn. Keep backend work aligned with erp-server `AGENTS.md` and frontend work aligned with erp-app `AGENTS.md`.
