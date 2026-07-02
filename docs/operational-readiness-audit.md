# TAMS — Operational Readiness Audit

Date: 2026-07-02  
Branch: `fix/operationalize-existing-platform-v1`  
Base audited: `main@20669a9d6a64da80a9486a2bfad36d99a00bb1e6`

## Scope and rule

This pass operationalizes features already visible in TAMS. It does not add a new product page or claim a new capability. The governing invariant is:

> A visible action must produce a confirmed server result, an explicit `missing_config`, or a readable error. It must never create a fake result.

No secret value is returned by the new status endpoints or rendered in the UI.

## Red Team findings before the fix

| Surface | Finding | Risk | Decision |
|---|---|---:|---|
| Studio assistant | Responses and latency were simulated with `setTimeout` | Critical product deception | Removed from the operational page |
| Studio progress | Progress advanced without backend evidence | Critical fake status | Removed |
| Studio upload | Local data URL and simulated progress looked like an upload | High | Disabled with an explicit “server storage not connected” message |
| Studio generic save | Video/audio plans could be persisted beside generated artifacts | High ghost results | Media is persisted only when the Action Bus returns `status=success`, `mode=real`, and an artifact URL |
| Video text-only | Depended on three external Pollinations downloads before FFmpeg | High reliability risk | Deterministic local FFmpeg frames are used when no explicit images are supplied |
| Audio | Provider needs HF/worker configuration | Medium | Returns `missing_config`; no asset is created |
| Image | Pollinations URL is external | Medium | Status is `external_unverified`; runtime error remains visible |
| Capabilities page | Catalog labels could be read as provider readiness | High | Added provider readiness snapshot and softened media labels |
| Results tab | Could mix plans with generated output | High | Shows only URL-backed assets tagged `studio-result` |

## Operational wiring

### Studio

| Visible mode | API / handler | Provider or storage | Success evidence | Failure behavior |
|---|---|---|---|---|
| Image | `POST /api/capabilities/execute`, `image.generate` | Pollinations | URL-backed image, then `POST /api/assets` | Explicit error; no asset |
| Video | `POST /api/capabilities/execute`, `video.generate` | FFmpeg | Real MP4 URL, file served by `/api/studio/video/:file`, then asset | Explicit error; no asset |
| Audio | `POST /api/capabilities/execute`, `audio.music.generate` | MusicGen worker or Hugging Face | Playable URL, then asset | `missing_config` or error; no asset |
| Document | `POST /api/assets` | TAMS database | Returned persisted asset | Error; no local ghost card |
| Prompt | `POST /api/assets` | TAMS database | Returned persisted asset | Error; no local ghost card |
| Template | `POST /api/assets` | TAMS database | Returned persisted asset | Error; no local ghost card |

The UI keeps a persistent operation card containing status, mode, provider, logs, limitations, and the artifact link when one exists. JSON parse errors, empty responses, HTTP errors, network failures, and timeouts are caught.

### Status endpoints

- `GET /api/studio/status`
  - reports media/provider readiness;
  - reports upload as `not_connected`;
  - exposes `resultsPolicy: real_artifacts_only`.
- `GET /api/capabilities/status`
  - separates handler presence from provider configuration;
  - reports configured providers by identifier only;
  - never exposes secret values.
- Existing `GET /api/version` and `GET /api/ops/status` remain in the CI smoke path.

## Existing surfaces preserved

| Surface | Audit outcome |
|---|---|
| Chat | Existing resilient local fallback and message preservation remain unchanged |
| Agents | Existing plan-mode orchestration remains unchanged; this pass does not claim autonomous execution |
| Life OS | Existing cockpit, permissions, jobs, history, integrations and coach tests remain unchanged |
| System | Existing memory, decisions, graph, workflow and recovery surfaces remain unchanged |
| Dev Agent / CI Operator | Existing runtime scenarios and CI checks remain unchanged and are rerun by the PR |
| Navigation | Existing routes are preserved; Studio stays at `/studio` |

## Required validation

The PR CI must pass all of the following:

- frontend production build;
- API production build;
- workspace typecheck;
- scripts test suite;
- Dev Runtime scenario;
- Mission 2 scenario;
- Life OS scenarios;
- provider/recovery/Life OS smoke;
- `/api/version`, `/api/ops/status`, `/api/studio/status`, `/api/capabilities/status`;
- a real local FFmpeg video generation, download, and non-empty MP4 file assertion;
- audio truth check: either a success with URL or `missing_config` without URL;
- Playwright action flow for Studio success and missing configuration;
- Playwright provider truth display on Capabilities.

## Remaining honest limitations

1. Railway production deployment is not verified from this environment.
2. Pollinations is a free external provider and is reported as `external_unverified` until execution.
3. The default text-only video is a real FFmpeg MP4 with simple local frames, not text-to-video AI.
4. Generated media uses temporary server storage and may disappear after a redeploy.
5. Audio needs `MUSICGEN_WORKER_URL`, `HF_TOKEN`, or `HUGGINGFACE_API_KEY`.
6. Studio upload is intentionally disabled until server storage is connected.
7. Browser E2E and production readiness remain pending until the PR checks complete.

## Release gate

Do not merge while any required check is red. A green CI proves the repository-level contract above; Railway production remains a separate deployment verification.
