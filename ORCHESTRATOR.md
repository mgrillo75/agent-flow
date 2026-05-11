# Agent Flow Orchestrator Notes

## Architecture

Agent Flow is a pnpm-style monorepo with three main runtime surfaces:

- `extension/`: VS Code/Cursor extension host. It starts Claude and Codex runtime watchers, converts runtime-specific session files into `AgentEvent`s, and posts those events to the webview.
- `web/`: React visualizer. It receives `AgentEvent`s through `web/lib/vscode-bridge.ts`, buffers them per session in `web/hooks/use-vscode-bridge.ts`, processes them in `web/hooks/use-agent-simulation.ts`, and renders the canvas in `web/components/agent-visualizer/**`.
- `scripts/` and `app/`: standalone relay/app path. The relay reuses extension watcher/parser code and streams events to the web app over SSE.

Important event boundary:

1. Runtime watcher tails session files.
2. Parser emits `extension/src/protocol.ts` `AgentEvent`s.
3. Bridge converts those into `web/lib/agent-types.ts` `SimulationEvent`s.
4. `web/hooks/simulation/process-event.ts` dispatches events to handlers.
5. Canvas draw modules render agents, edges, tool calls, particles, discoveries, and context.

## Module Boundaries

- Codex rollout parsing lives in `extension/src/codex-rollout-parser.ts`.
- Codex file discovery/tailing lives in `extension/src/codex-session-watcher.ts`.
- Claude transcript parsing and subagent file watching are separate; do not mix Codex fixes into Claude parser/watcher code without a clear shared abstraction.
- Web simulation handlers already understand `agent_spawn`, `agent_complete`, `subagent_dispatch`, and `subagent_return`; prefer parser-side mapping before changing rendering.
- Shared protocol shape is defined in `extension/src/protocol.ts`; web has mirrored bridge types in `web/lib/bridge-types.ts`.

## Conventions

- Keep parser changes narrow and covered by fixture-based tests.
- Preserve existing tool call start/end events when adding richer lifecycle events.
- For Windows local verification, use `npm.cmd --prefix extension ...` or direct `.\\node_modules\\.bin\\*.CMD` commands. `pnpm` may not be on PATH even though the repo has `pnpm-workspace.yaml`.
- `npm.cmd run test --workspace extension` does not work here because npm reports no configured workspaces.
- Existing unrelated dirty files must be preserved: `.vscode/settings.json` and untracked `launch-agent-flow-codex.cmd` were present before the Codex subagent fix.

## Decisions

- 2026-05-04: Current Codex rollouts do expose subagent lifecycle through `spawn_agent` and `wait_agent` function calls. `codex-rollout-parser.ts` now keeps normal tool-card events and also maps successful `spawn_agent` outputs to `subagent_dispatch` plus child `agent_spawn`. It maps completed `wait_agent` statuses to `subagent_return` plus child `agent_complete`.
- Child Codex display names use the returned `nickname` when available, falling back to a stable suffix from `agent_id`.
- Failed or malformed `spawn_agent` outputs must not create graph agents.
- 2026-05-04: Codex session cwd matching must be case-insensitive only on Windows. `codex-session-watcher.ts` exposes a pure `pathMatchesWorkspace` helper that normalizes comparison strings, lowercases them on `win32`, preserves POSIX case sensitivity, matches child paths, and rejects sibling prefixes such as `agent-flow-other`.
- 2026-05-04: Codex standalone launchers should set `CODEX_HOME` to the Codex home root, not the `sessions` child. `codex-session-watcher.ts` now exposes `codexSessionsRoot`, which appends `sessions` for a normal Codex home and defensively avoids `sessions\sessions` when a launcher or environment already points at the sessions directory.
- 2026-05-04: The local Codex-only launcher sets `AGENT_FLOW_CODEX_WORKSPACE=all` so the standalone relay watches Codex sessions across workspaces. Default relay behavior remains workspace-filtered; Claude discovery still uses the current workspace.
- 2026-05-05: Standalone SSE reconnect replay sends `agent-event-batch` for every listed session with a non-empty `eventBuffer`, ordered active first, then by recent activity, start time, and id. This preserves existing SSE message shapes and lets clients populate cross-workspace Codex session history before tab switching.
- 2026-05-05: `web/hooks/use-vscode-bridge.ts` declares bridge event/session/status/config subscription effect before the standalone `EventSource` effect so replay cannot post `session-list` or `agent-event-batch` messages before the hook has subscribers.
- 2026-05-04: Canvas-attached message bubbles must stay readable while visible. `draw-bubbles.ts` now uses stronger fill/stroke, larger text, full text opacity, a subtle dark shadow, and skips bubbles once fade alpha drops below the readable threshold instead of leaving ghost text.

## Verification

Useful commands from this workspace:

- `.\\node_modules\\.bin\\tsx.CMD --test extension\\test\\codex-rollout-parser.test.ts`
- `.\\node_modules\\.bin\\tsx.CMD --test extension\\test\\codex-session-watcher.test.ts extension\\test\\codex-rollout-parser.test.ts`
- `npm.cmd --prefix extension run test`
- `npm.cmd --prefix extension run build`
- `npm.cmd --prefix web run build:webview`
- `npm.cmd run build:app`

The Codex subagent parser fix was additionally smoke-checked against a real local rollout containing `spawn_agent` and `wait_agent` records; after the change it emitted one orchestrator, 14 child agent spawns, 14 subagent returns, and 14 child completions.
After the Windows path-matching fix, the rebuilt standalone app attached to current Codex rollout sessions and rendered a live Codex agent at `http://127.0.0.1:3001`.
After the Codex standalone launcher path fix, `.\\node_modules\\.bin\\tsx.CMD --test extension\\test\\codex-session-watcher.test.ts` and `npm.cmd run build:app` passed.
After the Codex workspace-scope fix, `npm.cmd test`, `.\\node_modules\\.bin\\tsx.CMD --test extension\\test\\codex-session-watcher.test.ts extension\\test\\codex-rollout-parser.test.ts`, and `npm.cmd run build:app` passed.
After the all-session SSE replay and frontend listener-order fixes, `npm.cmd test`, `.\\node_modules\\.bin\\tsx.CMD --test extension\\test\\codex-session-watcher.test.ts extension\\test\\codex-rollout-parser.test.ts`, and `npm.cmd run build:app` passed.
After restarting the corrected Codex-only standalone app on `http://127.0.0.1:3002`, `/events` returned active Codex sessions plus one replayed `agent-event-batch` per buffered session. Playwright verified the page showed `LIVE`, three session tabs, and rendered agents after selecting two non-initial replayed worker tabs. The only browser console error was a harmless missing `/favicon.ico`.
After the bubble contrast fix, a Playwright screenshot of the standalone app confirmed the top-left canvas message bubble text was readable and low-alpha ghost bubbles no longer remained.

## Fragile Areas

- Session event buffering is order-sensitive. The web bridge selects a session from lifecycle/list messages, then flushes buffered events in the visualizer layout effect.
- Standalone SSE replay is also listener-order-sensitive. Keep bridge subscriptions registered before creating the `EventSource`; otherwise immediate replay batches can be posted to `window` before `onSession`/`onEvent` subscribers exist.
- Codex rollout output shapes may evolve. Keep fallback behavior conservative: unknown or malformed subagent output should leave normal tool-call visualization intact rather than inventing child agents.
- `event_msg` records often mirror `response_item` records; the Codex parser intentionally avoids duplicate user/assistant/tool result emission.
