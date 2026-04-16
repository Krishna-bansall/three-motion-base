# Agent Instructions

## Core Workflow
- Act autonomously for implementation, but collaboratively for design.
- Use a **"Draft → Sync → Execute"** loop for non-trivial tasks.
- Keep chat concise. Pass large context, plans, and architectural proposals via files (e.g., drafts `.md`, `.txt`).
- Keep task logging in `/logs`; create or update a task-scoped file there for notes, decisions, progress, and handoff context.

## When to Ask (Stop & Sync)
- Changing data models or state management.
- Major UI/UX design choices.
- Adding dependencies or external integrations.
- Hitting unexpected architectural blockers.

## When to Execute (Do Not Ask)
- Refactoring internal logic.
- Fixing type errors, bugs, or linting.
- Generating boilerplate from approved designs.
- Writing standard tests.

## Rules of Engagement
- Output architecture and major code blocks to files, not chat.
- Tell me what you drafted, point me to the file, and ask 1-2 specific questions for my approval.
- Once I approve, execute the full implementation autonomously without asking permission for micro-steps.
- When work is ongoing, append concise status updates to the relevant `/logs/*.md` file instead of scattering context across chat.
