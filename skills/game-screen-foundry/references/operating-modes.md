# Operating Modes

All modes use the same `screen-kv.json`, `material-spec.json`, `world-preset.json`, generated assets, validators, and imagegen generation contracts. A mode changes who drives the iteration, not the project format.

## Select A Mode

- `guided`: Use when the user wants to adjust exact positions, dimensions, content insets, or asset settings in the app.
- `autonomous`: Use when the user gives a project path and outcome, then expects the agent to generate, inspect, and improve the screen within a bounded iteration budget.
- `hybrid`: Use by default. Produce and validate a strong first pass autonomously, then let the user perform final detailed edits in the app.

Natural-language routing examples:

- "Move this button 8 px and widen the safe label area" means `guided`.
- "Finish the HOME screen and improve it up to three times" means `autonomous`.
- "Make the initial version, then I will tune it" means `hybrid`.

Ask about the mode only when the requested degree of control is genuinely ambiguous. Otherwise choose and state it briefly.

## Shared Boundaries

- Treat project JSON and adopted PNGs as the shared source of truth.
- Keep agent session artifacts under `.game-creative-generation/agent-sessions/`; they are resumable working records, not shipped game assets.
- Preserve locked assets and layout coordinates unless the user explicitly permits changes.
- Require mechanical validation before expensive generation and an assembled-screen snapshot before visual acceptance.
- Stop after the configured iteration budget instead of silently continuing.

Read `autonomous-workflow.md` for autonomous or hybrid first-pass work. Read `app-guided-workflow.md` for detailed app work.
