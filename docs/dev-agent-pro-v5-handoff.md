# Dev Agent Pro v5 — handoff

## Status

PR: #79
Branch: feat/dev-agent-pro-v5
Target: main

Current verdict: WARN.

## What is already done

- API route mounted for Dev Agent Pro v5.
- Status endpoint.
- Sandbox dry-run endpoint.
- Command-plan endpoint.
- Repo-index foundation endpoint.
- Context compaction endpoints.
- Sub-agent endpoints.
- Diff preview endpoints.
- Benchmark endpoint and benchmark script.
- Session endpoints.
- Plugin registry endpoints.
- Repair dry-run endpoints.
- Basic UI route /dev-agent-pro.
- Report file for scope and limitations.

## Validation already passed on latest run before handoff

- Build passed.
- Typecheck passed.
- Runtime tests passed.
- API smoke passed.

## Remaining blocker

Only the browser E2E step was failing.

Most likely reason: the page-specific assertion for /dev-agent-pro expects a visible label that is not rendered exactly as expected by Playwright.

## Fix objective for Codex

Make CI fully green without hiding the real issue.

Allowed fixes:

1. Prefer fixing the /dev-agent-pro page so the tested labels are visible.
2. Or adjust the Dev Agent Pro E2E test to assert stable product behavior instead of fragile copy.
3. Keep a meaningful route load test for /dev-agent-pro.
4. Keep backend smoke coverage for /api/dev-agent/pro/status and core routes.

Forbidden fixes:

- Do not merge while CI is red.
- Do not delete the whole E2E suite.
- Do not remove Life OS E2E coverage.
- Do not fake a PASS.
- Do not claim this is equal to Claude Code.
- Do not add shell execution beyond allowlisted dry-run behavior.

## Acceptance criteria

- Build: pass.
- Typecheck: pass.
- Runtime tests: pass.
- API smoke: pass.
- Browser E2E: pass.
- PR mergeable: true.
- Merge only after all checks are green.

## Honest product scope

This PR is a Dev Agent Pro v5 foundation, not a full Claude Code replacement.

Strong parts:

- Permission-aware design.
- Dry-run command control.
- API contracts.
- Repo-index foundation.
- Plugin/status registry.
- Benchmark catalog.
- Repair loop placeholder.

Still partial:

- Real isolated shell runner.
- Real worktrees per agent.
- Persistent repo symbol index.
- Persistent session DB.
- Real patch generation and review loop.
- Full autonomous repair across CI failures.

## Recommended next prompt for Codex

Take PR #79 on branch feat/dev-agent-pro-v5. Read the latest CI logs. Fix only the remaining browser E2E failure. Keep build, typecheck, runtime tests, API smoke, and existing Life OS E2E coverage. Do not fake pass. Do not delete meaningful tests. When CI is fully green, merge PR #79 into main and report the final SHA.
