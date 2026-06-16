# Installing the Railway operator skill

This folder contains a skill that teaches Claude Code how to safely operate Railway on your behalf — it makes Claude back up databases before deleting anything, double-check which environment it's deploying to, and confirm deploys actually succeeded before saying so.

## Install (one minute)

Copy the skill into your personal Claude Code skills folder:

```bash
mkdir -p ~/.claude/skills/operating-railway-for-owners
cp SKILL.md ~/.claude/skills/operating-railway-for-owners/SKILL.md
```

That's it. Next time you start `claude`, the skill is picked up automatically whenever you ask about Railway, deploying, databases, or your bill.

## Verify it's active

Start Claude and ask:

> "What skills do you have for Railway?"

It should mention **operating-railway-for-owners**.

## See also

`railway-claude-guide.md` (in the docs folder) — the full guide on using Railway with Claude: setup, workspaces, databases, and everyday prompts.
