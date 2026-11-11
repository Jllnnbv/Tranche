import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Scene1Hook } from "./scenes/Scene1Hook";
import { Scene2Hero } from "./scenes/Scene2Hero";
import { Scene3SplitEngine } from "./scenes/Scene3SplitEngine";
import { Scene4Contract } from "./scenes/Scene4Contract";
import { Scene5Dashboard } from "./scenes/Scene5Dashboard";
import { Scene6Outro } from "./scenes/Scene6Outro";
import { COLORS } from "./theme";

export const AmbaganMarketingAd: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Subtle bottom timeline progress ribbon
  const progressPct = (frame / durationInFrames) * 100;

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.forest }}>
      {/* Master Programmatic Audio Track (Synth + Whooshes + Chimes + Clicks) */}
      <Audio src={staticFile("audio/soundtrack.wav")} volume={0.92} />

      {/* Scene 1: 0:00 - 0:06 (360 frames) — Hook & Problem vs. Non-Custodial Breakthrough */}
      <Sequence from={0} durationInFrames={360} name="1. Hook & Breakthrough">
        <Scene1Hook />
      </Sequence>

      {/* Scene 2: 0:06 - 0:13 (420 frames) — Brand Reveal & Live Hero Recording */}
      <Sequence from={360} durationInFrames={420} name="2. Brand Reveal & Hero">
        <Scene2Hero />
      </Sequence>

      {/* Scene 3: 0:13 - 0:21 (480 frames) — Pure Motion Graphics 77/20/3 Split Engine */}
      <Sequence from={780} durationInFrames={480} name="3. 77/20/3 Smart Split Engine">
        <Scene3SplitEngine />
      </Sequence>

      {/* Scene 4: 0:21 - 0:28 (420 frames) — Live E-Contract & Cryptographic Signatures */}
      <Sequence from={1260} durationInFrames={420} name="4. Group E-Contract & Consensus">
        <Scene4Contract />
      </Sequence>

      {/* Scene 5: 0:28 - 0:35 (420 frames) — Live Group Dashboard, GCash Checkout & Receipt */}
      <Sequence from={1680} durationInFrames={420} name="5. Live Dashboard & Checkout">
        <Scene5Dashboard />
      </Sequence>

      {/* Scene 6: 0:35 - 0:40 (300 frames) — Outro Brand Lockup & CTA */}
      <Sequence from={2100} durationInFrames={300} name="6. Outro & Call To Action">
        <Scene6Outro />
      </Sequence>

      {/* Sleek Bottom Progress Bar */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 5,
          background: "rgba(14, 36, 28, 0.12)",
          zIndex: 50,
        }}
      >
        <div
          style={{
            width: `${progressPct}%`,
            height: "100%",
            background: "linear-gradient(90deg, #b54880 0%, #35a167 50%, #e1eda0 100%)",
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
