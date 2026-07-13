# Autonomous Conversational Workflow

Use this workflow when the agent should progress without asking the user to open the Electron/browser app.

## 1. Establish The Session

Start a bounded session and retain the returned `sessionId`:

```sh
npm run agent:session -- start /path/to/creative [screen-id] \
  --mode autonomous --max-iterations 3 --approval major_changes
```

Use `hybrid` instead of `autonomous` when the user will finish in the app. Approval policies:

- `major_changes`: ask before changing world direction, screen structure, or layout coordinates.
- `every_iteration`: ask after every assembled-screen review.
- `completion_only`: proceed through targeted visual changes and report at completion.

## 2. Gate Structure Before Generation

Run:

```sh
npm run validate:project -- /path/to/creative [screen-id]
npm run structure:preview -- /path/to/creative [screen-id] --out /tmp/structure.svg
```

Fix failing structure, composition, slot, and layout checks before generating raster assets. Do not change coordinates merely to improve art styling.

## 3. Generate Through The Shared Contract

Create the handoff:

```sh
npm run imagegen:handoff -- /path/to/creative [screen-id]
```

Read the emitted job JSON. For each asset, use the installed `imagegen` Skill with `generationContract.inputImages`, `change`, `preserve`, transparency plan, and acceptance checks. Save the inspected raster exactly to `outputPath`. After all outputs are present:

```sh
npm run imagegen:handoff -- /path/to/creative [screen-id] --adopt
```

Do not continue until rejected outputs are fixed or recorded as blockers.

## 4. Render And Inspect The Assembled Screen

Capture the first iteration:

```sh
npm run screen:snapshot -- /path/to/creative [screen-id] \
  --session SESSION_ID --iteration 1
```

Open the emitted `screen.png` with the environment's image viewer. Read the adjacent `snapshot.json`; `fallbackAssetIds` identifies placeholder-backed layers that must not be mistaken for generated art.

Evaluate both the image and mechanical summaries. Check hierarchy, focal priority, frame/content separation, density, runtime-text safety, repeated-family consistency, alpha gutters, and whether the screen still matches its world preset.

## 5. Record A Review

Write a small JSON file matching `schemas/agent-review.schema.json`. Use:

```json
{
  "iteration": 1,
  "decision": "continue",
  "summary": "The primary CTA needs stronger separation; the rest is stable.",
  "findings": [
    {
      "severity": "warn",
      "scope": "btn_primary",
      "message": "The CTA edge merges with its parent panel.",
      "action": "Increase edge contrast without changing geometry."
    }
  ],
  "preserve": ["layout coordinates", "accepted background", "runtime text slot"],
  "change": ["btn_primary edge contrast"],
  "nextActions": ["Regenerate btn_primary only"]
}
```

Record it:

```sh
npm run agent:session -- review /path/to/creative SESSION_ID \
  --iteration 1 --file /tmp/review.json
```

## 6. Iterate Minimally

For `continue`, generate only named assets:

```sh
npm run imagegen:handoff -- /path/to/creative [screen-id] --assets btn_primary
```

Use the current asset as `edit_target`, preserve unaffected invariants, then adopt with the same target list:

```sh
npm run imagegen:handoff -- /path/to/creative [screen-id] --assets btn_primary --adopt
```

Capture the next iteration after adoption. The snapshot command requires the previous review before accepting another iteration.

Stop when:

- `decision` is `complete`;
- a major change requires user approval;
- `decision` is `needs_user`;
- the session reaches `maxIterations`;
- image generation or validation is blocked.

Completion requires no failing mechanical checks, no unresolved critical fallback assets, and an inspected assembled screenshot. Report the final screenshot path, session id, remaining warnings, and changed assets.
