# App-Guided Workflow

Use this mode when the user wants direct control over layout geometry, content insets, individual asset settings, locks, or regeneration comments.

## Open The Project

Run `npm run desktop` or use the platform launcher, then load `/path/to/creative#screen-id`. The bundled demo should be opened only through the explicit demo command.

## Work Order

1. Use ワイヤーフレーム作成 to fix structure, content slots, and frame insets.
2. Save screen JSON before image generation.
3. Generate or re-import PNGs, then inspect the generated view.
4. Lock accepted assets and queue only assets with concrete findings.
5. Run validation and the implementation report before handoff.

The app and autonomous mode share the same project contracts and generated assets. A project produced by an autonomous or hybrid session can therefore be opened directly for detailed tuning. Agent iteration records remain under `.game-creative-generation/agent-sessions/` for audit and resume purposes.

When switching from app-guided work back to autonomous work, save all JSON edits first, then start or resume a bounded agent session. Do not let the agent infer unsaved browser state.
