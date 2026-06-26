# Generated Assets

This folder is for raster assets produced outside the beta app, such as Codex-side imagegen output and stable local raster composites.

Expected flow:

1. Generate an asset with imagegen using the prompt from the material spec.
2. Save the final PNG/WebP in this folder.
3. Register the file in `world-preset.json` under `imagegenAssets`, or provide `imagegen-assets.json` when loading a custom folder.
4. Press `素材を一括生成` in the beta app. Registered files are adopted as generated asset revisions.

The demo currently includes registered PNG seeds for all 50 HOME-screen assets targeted by `imagegenWorkflow.targetAssetIds`.

Most large panels, buttons, and icons are built-in imagegen outputs converted from chroma-key backgrounds to transparent PNG. The following 9 precision UI parts are local raster composites because fixed geometry is more important than generative variation:

- `bar_profile_exp_base.png`
- `bar_profile_exp_fill.png`
- `bar_rank_progress_base.png`
- `bar_rank_progress_fill.png`
- `bar_mission_progress_base.png`
- `bar_mission_progress_fill.png`
- `carousel_dot_active.png`
- `carousel_dot_idle.png`
- `badge_notification_count.png`

Major built-in imagegen style carriers include:

- `bg_sky_port_home.png`
- `hub_profile_shell.png`
- `crest_anchor_badge.png`
- `hub_resource_capsule.png`
- `btn_top_utility_round.png`
- `frame_player_profile_outer.png`
- `emblem_rank_compass.png`
- `art_event_banner_fill.png`
- `frame_event_banner_outer.png`
- `ribbon_event_live.png`
- `frame_daily_mission_outer.png`
- `btn_start_sortie.png`
- `card_side_cta_shell.png`
- `icon_gift_crate.png`
- `icon_gacha_orb.png`
- `panel_bottom_nav.png`
- `btn_nav_active.png`
- `btn_nav_default.png`

Runtime text, dynamic numbers, notification counts, timers, and localized menu labels are still rendered as overlay text and are not baked into the asset PNGs.
