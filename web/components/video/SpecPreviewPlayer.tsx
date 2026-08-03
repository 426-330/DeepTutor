"use client";

/**
 * Player 内核（dynamic ssr:false 载入）：复用 remotion-worker 的
 * ConceptVideo composition（场景/布局/样式链组件树，无 node-only 依赖；
 * 源码由 scripts/sync-remotion-preview.mjs 同步到 vendor/）。
 */
import { Player } from "@remotion/player";

import type { VideoIR } from "@/vendor/remotion-preview/parser/types";
import { ConceptVideo } from "@/vendor/remotion-preview/remotion/ConceptVideo";

export default function SpecPreviewPlayer({ ir }: { ir: VideoIR }) {
  return (
    <Player
      acknowledgeRemotionLicense
      component={ConceptVideo}
      inputProps={{ ir }}
      durationInFrames={Math.max(1, ir.totalFrames)}
      fps={ir.fps}
      compositionWidth={1920}
      compositionHeight={1080}
      controls
      style={{ width: "100%", borderRadius: 12 }}
    />
  );
}
