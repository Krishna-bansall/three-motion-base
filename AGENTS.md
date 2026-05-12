# Agent Instructions

## Agent skills

## Branch guidance

- Ignore `codex-testbranch` and `codex-test-push` for implementation, review, and branch-base decisions. They contain exploratory motion/project work that is not design authority.
- New issue/PRD implementation branches created after `codex-test-push`, including `issue-33-project-studio-scene`, can be trusted by their own diffs, linked GitHub issues, PRDs, `CONTEXT.md`, and explicit design decisions.
- For issue refinement and PRD work, do not infer product requirements from `codex-testbranch` or `codex-test-push` code. Use GitHub issues, PRDs, `CONTEXT.md`, and agreed design decisions as the source of truth.

### Issue tracker

Issues and PRDs are tracked in GitHub Issues for `Krishna-bansall/three-motion-base`. See `docs/agents/issue-tracker.md`.

### Triage labels

This repo uses the default five-label triage vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repo: read root `CONTEXT.md` and root `docs/adr/` when present. See `docs/agents/domain.md`.
