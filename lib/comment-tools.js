"use strict";

function baseDirectives() {
  return {
    brightnessDelta: 0,
    contrastDelta: 0,
    ornamentDelta: 0,
    emphasisDelta: 0,
    roundnessDelta: 0,
    materialHint: "",
    readabilityBoost: 0,
    moodShift: ""
  };
}

function mergeDirectives(left, right) {
  const base = {
    ...baseDirectives(),
    ...(left || {})
  };
  const patch = {
    ...baseDirectives(),
    ...(right || {})
  };

  return {
    brightnessDelta: base.brightnessDelta + patch.brightnessDelta,
    contrastDelta: base.contrastDelta + patch.contrastDelta,
    ornamentDelta: base.ornamentDelta + patch.ornamentDelta,
    emphasisDelta: base.emphasisDelta + patch.emphasisDelta,
    roundnessDelta: base.roundnessDelta + patch.roundnessDelta,
    materialHint: patch.materialHint || base.materialHint,
    readabilityBoost: base.readabilityBoost + patch.readabilityBoost,
    moodShift: patch.moodShift || base.moodShift
  };
}

function applyAssetAwareFallbackDirectives(directives, asset) {
  if (!asset) {
    directives.brightnessDelta += 4;
    directives.contrastDelta += 6;
    return;
  }

  if (asset.role === "progress_track") {
    directives.brightnessDelta += 6;
    directives.contrastDelta += 10;
    directives.readabilityBoost += 1;
    return;
  }

  if (asset.role === "progress_fill") {
    directives.brightnessDelta += 8;
    directives.contrastDelta += 10;
    directives.emphasisDelta += 1;
    directives.readabilityBoost += 1;
    directives.materialHint = directives.materialHint || "crystal";
    return;
  }

  if (asset.assetType === "button") {
    directives.contrastDelta += 10;
    directives.emphasisDelta += 1;
    directives.readabilityBoost += 1;
    return;
  }

  if (asset.assetType === "panel" || asset.assetType === "card_frame") {
    directives.brightnessDelta += 4;
    directives.contrastDelta += 8;
    directives.readabilityBoost += 1;
    return;
  }

  if (asset.assetType === "icon") {
    directives.brightnessDelta += 4;
    directives.contrastDelta += 8;
    directives.emphasisDelta += 1;
    return;
  }

  directives.brightnessDelta += 4;
  directives.contrastDelta += 6;
}

function normalizeCommentHeuristically(comment, asset) {
  const text = String(comment || "").trim();
  const directives = baseDirectives();
  let action = "retouch";
  const cues = [];

  const pushCue = (cue) => {
    if (!cues.includes(cue)) {
      cues.push(cue);
    }
  };

  if (!text) {
    return {
      action: "noop",
      summary: "No comment provided",
      normalizedComment: "",
      rationale: "User did not provide an edit request.",
      directives,
      relatedAssetIds: []
    };
  }

  if (/lock|fix|確定|これでよい|これでいい/u.test(text)) {
    action = "lock";
    pushCue("good enough to freeze");
  }

  if (/move|位置|上に|下に|左に|右に|寄せ/u.test(text)) {
    action = "reposition";
    pushCue("layout-oriented feedback");
  }

  if (/more|強|目立|push|cta|存在感|映える/u.test(text)) {
    directives.emphasisDelta += 1;
    directives.contrastDelta += 10;
    pushCue("increase emphasis");
  }

  if (/readable|可読|見やす|読みやす|埋も|識別/u.test(text)) {
    directives.readabilityBoost += 1;
    directives.contrastDelta += 14;
    directives.brightnessDelta += 8;
    pushCue("raise readability");
  }

  if (/bright|明る/u.test(text)) {
    directives.brightnessDelta += 12;
    pushCue("raise brightness");
  }

  if (/dark|暗/u.test(text)) {
    directives.brightnessDelta -= 12;
    pushCue("lower brightness");
  }

  if (/gold|金|brass|真鍮/u.test(text)) {
    directives.materialHint = "brass";
    pushCue("shift material to brass");
  }

  if (/stone|石/u.test(text)) {
    directives.materialHint = "stone";
    pushCue("shift material to stone");
  }

  if (/crystal|宝石|gem/u.test(text)) {
    directives.materialHint = "crystal";
    directives.emphasisDelta += 1;
    pushCue("add crystal accent");
  }

  if (/simple|シンプル|装飾を減|ごちゃ|うるさ/u.test(text)) {
    directives.ornamentDelta -= 1;
    pushCue("reduce ornament");
  }

  if (/ornate|豪華|高級|装飾を増/u.test(text)) {
    directives.ornamentDelta += 1;
    pushCue("increase ornament");
  }

  if (/round|丸/u.test(text)) {
    directives.roundnessDelta += 1;
    pushCue("rounder silhouette");
  }

  if (/sharp|角|尖/u.test(text)) {
    directives.roundnessDelta -= 1;
    pushCue("sharper silhouette");
  }

  if (/mysterious|神秘|怪し/u.test(text)) {
    directives.moodShift = "mysterious";
    pushCue("move mood to mysterious");
  }

  if (/warm|暖|温/u.test(text)) {
    directives.moodShift = "warm";
    directives.brightnessDelta += 4;
    pushCue("warmer mood");
  }

  if (!cues.length) {
    applyAssetAwareFallbackDirectives(directives, asset);
    pushCue("general visual refinement");
  }

  return {
    action,
    summary: cues[0],
    normalizedComment: text,
    rationale: cues.join(", "),
    directives,
    relatedAssetIds: []
  };
}

function buildHeuristicReview({ renderModel, revisionMap }) {
  const assets = renderModel.assets;
  const criticalAssetIds = new Set([
    "bg_sky_port_home",
    "hub_profile_shell",
    "hub_resource_capsule",
    "frame_player_profile_outer",
    "art_event_banner_fill",
    "frame_event_banner_outer",
    "frame_daily_mission_outer",
    "btn_start_sortie",
    "card_side_cta_shell",
    "panel_bottom_nav"
  ]);
  const priorityWeight = {
    high: 10,
    medium: 6,
    low: 4
  };

  const progressRows = assets.map((asset) => {
    const revision = revisionMap[asset.assetId] || null;
    const directives = revision && revision.directives ? revision.directives : baseDirectives();
    const weight = priorityWeight[asset.visualPriority] || 4;
    let score = 0;

    if (revision && revision.revisionCount > 0) {
      score += weight;
      score += Math.min(revision.revisionCount - 1, 2) * 2;
    }

    if (revision && revision.locked) {
      score += Math.round(weight * 0.7);
    }

    if (asset.role === "primary_cta") {
      score += directives.readabilityBoost > 0 ? 8 : 0;
      score += directives.emphasisDelta > 0 ? 6 : 0;
      score += directives.contrastDelta > 0 ? 4 : 0;
    }

    if (asset.role === "title_logo") {
      score += directives.emphasisDelta > 0 ? 4 : 0;
      score += directives.readabilityBoost > 0 ? 4 : 0;
    }

    if (asset.role === "ambient_backdrop") {
      score += revision && revision.revisionCount > 0 ? 4 : 0;
    }

    return {
      asset,
      directives,
      revision,
      score,
      weight,
      progress: Math.max(0, Math.min(100, score))
    };
  });

  const revisedCount = progressRows.filter((row) => row.revision && row.revision.revisionCount > 0).length;
  const lockedCount = progressRows.filter((row) => row.revision && row.revision.locked).length;
  const imagegenRows = progressRows.filter((row) => row.revision && row.revision.generationMeta && row.revision.generationMeta.usesImagegen);
  const imagegenCount = imagegenRows.length;
  const criticalImagegenCount = imagegenRows.filter((row) => criticalAssetIds.has(row.asset.assetId)).length;
  const imagegenAssetIds = new Set(imagegenRows.map((row) => row.asset.assetId));
  const missingCriticalAssetIds = [...criticalAssetIds].filter((assetId) => !imagegenAssetIds.has(assetId));
  const highPriorityRows = progressRows.filter((row) => row.asset.visualPriority === "high");
  const allHighPriorityLocked = highPriorityRows.length > 0 && highPriorityRows.every((row) => row.revision && row.revision.locked);
  const completionScore = Math.round((revisedCount / Math.max(assets.length, 1)) * 18);
  const criticalImagegenRatio = criticalImagegenCount / Math.max(criticalAssetIds.size, 1);
  const imagegenScore = Math.round((imagegenCount / Math.max(assets.length, 1)) * 12) + Math.round(criticalImagegenRatio * 24);
  const lockScore = Math.round((lockedCount / Math.max(assets.length, 1)) * 8) + (allHighPriorityLocked ? 6 : 0);
  const directiveScore = Math.min(12, Math.round(progressRows.reduce((total, row) => {
    const directives = row.directives || baseDirectives();
    return total
      + Math.abs(directives.brightnessDelta)
      + Math.abs(directives.contrastDelta)
      + Math.max(0, directives.ornamentDelta) * 2
      + Math.max(0, directives.emphasisDelta) * 3
      + Math.max(0, directives.readabilityBoost) * 2;
  }, 0) / 18));
  const rawScore = 30 + completionScore + imagegenScore + lockScore + directiveScore;
  const scoreCap = imagegenCount === 0
    ? 58
    : criticalImagegenRatio < 0.3
      ? 66
      : criticalImagegenRatio < 0.5
        ? 72
        : criticalImagegenRatio < 0.8
          ? 80
          : criticalImagegenRatio < 1
            ? 86
            : 92;
  const screenScore = Math.max(28, Math.min(scoreCap, rawScore));

  const sorted = [...assets].sort((left, right) => {
    const priority = { high: 0, medium: 1, low: 2 };
    return (priority[left.visualPriority] || 3) - (priority[right.visualPriority] || 3);
  });

  const topTargets = progressRows
    .filter((row) => !(row.revision && row.revision.locked))
    .sort((left, right) => {
      if (left.asset.visualPriority !== right.asset.visualPriority) {
        const priority = { high: 0, medium: 1, low: 2 };
        return (priority[left.asset.visualPriority] || 3) - (priority[right.asset.visualPriority] || 3);
      }
      return left.progress - right.progress;
    })
    .slice(0, 3)
    .map((row) => row.asset);

  const topFindings = topTargets.map((asset, index) => {
    const messages = {
      primary_cta: {
        title: "主CTAを最優先で固める",
        message: "主CTAは画面の判断軸なので、背景や枠より先に押しやすさと視認性を収束させるべきです。",
        suggestedComment: "もっと目立たせつつ、文字の可読性を最優先にして"
      },
      modal_base: {
        title: "土台パネルを先に安定させる",
        message: "土台パネルが揺れると上に載る全素材の評価がぶれるので、先に土台の質感と余白感を固めるべきです。",
        suggestedComment: "情報を載せやすく、中央が読みやすい土台にして"
      },
      reward_marker: {
        title: "報酬アイコンの格を一段上げる",
        message: "報酬アイコンは期待感の核なので、カード枠より一段上の華やかさを持たせるとまとまります。",
        suggestedComment: "報酬感を強めつつ、シルエットをもっと読みやすくして"
      },
      progress_track: {
        title: "進捗バー土台の視認性を上げる",
        message: "細いバー土台は差分が弱いと更新が見えないため、明度と境界のコントラストを意図的に上げるべきです。",
        suggestedComment: "少し明るくして、可読性を上げつつ存在感を強めて"
      },
      progress_fill: {
        title: "進捗フィルの伸びを見やすくする",
        message: "フィル部分は量の変化がすぐ分かる必要があるため、発光感と明度を上げて主張を作るべきです。",
        suggestedComment: "もっと明るくして、進捗が分かるように存在感を強めて"
      },
      default: {
        title: "画面全体の中で見直す",
        message: "単体の良し悪しではなく、周囲との階層差と役割の整合を見ながら詰めるべきです。",
        suggestedComment: "周囲との役割差が分かるように、少し明るくして存在感を強めて"
      }
    };
    const bundle = messages[asset.role] || messages.default;
    return {
      assetId: asset.assetId,
      severity: index === 0 ? "high" : "medium",
      title: bundle.title,
      message: bundle.message,
      suggestedComment: bundle.suggestedComment
    };
  });

  if (revisedCount > 0 && imagegenCount === 0) {
    topFindings.unshift({
      assetId: "bg_sky_port_home",
      severity: "high",
      title: "実画像生成に切り替える",
      message: "現在の一括生成はSVGモックなので、KVの描き込みや空気感には届いていません。背景、イベントバナー、大型アイコンからimagegen生成に切り替えるべきです。",
      suggestedComment: "背景をimagegenで作り直し、KVの空港都市らしい描き込みと奥行きを優先して"
    });
  } else if (imagegenCount > 0 && criticalImagegenCount < criticalAssetIds.size) {
    topFindings.unshift({
      assetId: missingCriticalAssetIds[0] || "frame_player_profile_outer",
      severity: "high",
      title: "主要素材のimagegen化が不足",
      message: `実画像は入っていますが、主要UI素材がまだSVG生成寄りです。次は ${missingCriticalAssetIds.slice(0, 4).join(" / ")} をimagegen化するべきです。`,
      suggestedComment: "KVの黒金フレーム、真鍮装飾、青い発光アクセントに合わせて実画像で作り直して"
    });
  }

  const lockAssetIds = assets
    .filter((asset) => {
      const revision = revisionMap[asset.assetId];
      const directives = revision && revision.directives ? revision.directives : baseDirectives();
      if (!revision || revision.revisionCount === 0) {
        return false;
      }
      if (revision.locked) {
        return true;
      }
      if (asset.role === "primary_cta") {
        return revision.generationMeta && revision.generationMeta.usesImagegen && directives.readabilityBoost > 0 && directives.emphasisDelta > 0;
      }
      if (asset.visualPriority === "high") {
        return revision.generationMeta && revision.generationMeta.usesImagegen && revision.revisionCount >= 1;
      }
      return false;
    })
    .map((asset) => asset.assetId);

  const suggestedActions = topFindings.map((finding) => ({
    assetId: finding.assetId,
    action: finding.severity === "high" ? "regenerate" : "retouch",
    reason: finding.message,
    suggestedComment: finding.suggestedComment
  }));

  let summary = "主CTAと土台を先に収束させ、良い素材は早めに固定してブレを止めるべきです。";
  if (revisedCount > 0 && imagegenCount === 0) {
    summary = "現在はSVGモック段階です。構造確認としては進んでいますが、KVの雰囲気評価としてはまだ低く、実画像生成への切り替えが必要です。";
  } else if (imagegenCount > 0 && criticalImagegenCount < criticalAssetIds.size) {
    summary = "一部の素材はimagegen実画像に切り替わっています。ただし主要UI素材の多くがまだSVG生成なので、KVらしさの評価は中間段階です。";
  } else if (screenScore >= 90) {
    summary = "主要素材はほぼ収束しています。残りは微調整より、良い版を固定して破綻を防ぐ段階です。";
  } else if (screenScore >= 80) {
    summary = "画面の骨格は揃っています。高優先素材の固定を進めれば収束域に入れます。";
  } else if (screenScore >= 65) {
    summary = "方向性は揃ってきましたが、主要素材の固定と役割差の整理がまだ必要です。";
  } else if (screenScore < 55) {
    summary = "まだ探索段階です。主要素材を順に触り、役割ごとの差を先に作るべきです。";
  }

  return {
    summary,
    screenScore,
    lockAssetIds,
    topFindings,
    suggestedActions,
    guardrails: [
    "SVGモックだけの状態では高評価にしない",
    "KV再現度は背景、上部HUB、左右パネル、イベントバナー、主CTA、下部ナビの実画像生成を必須条件にする",
      "一度良くなった素材は早めに固定する",
      "背景よりも CTA と土台を先に詰める",
      "毎回フル引き直しではなく差分再生成を優先する"
    ]
  };
}

module.exports = {
  baseDirectives,
  buildHeuristicReview,
  mergeDirectives,
  normalizeCommentHeuristically
};
