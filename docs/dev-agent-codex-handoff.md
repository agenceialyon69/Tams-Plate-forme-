# Codex Handoff

Branch: `tams-dev`.

Goal: review and harden the Dev Agent CI Operator implementation before any merge to `main`.

Focus areas:

- GitHub Actions dispatch endpoint.
- CI runs, jobs, and logs reader.
- Failed jobs rerun endpoint.
- Pull request creation endpoint.
- Timeboxed repair loop.
- Scheduler behavior.
- Playwright coverage for Chat, Studio, Capabilities, Agents, and System.

Rule: do not push directly to `main`.
