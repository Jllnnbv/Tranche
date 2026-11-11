import React from "react";
import {
  AbsoluteFill,
  spring,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { AmbientCanvas } from "../components/AmbientCanvas";
import { Browser3DStage } from "../components/Browser3DStage";
import { BentoCard } from "../components/BentoCard";
import { COLORS, FONTS } from "../theme";

export const Scene4Contract: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerSpring = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 120 },
  });

  // Animated signature counter (1/6 -> 6/6)
  const sigCount = Math.min(
    6,
    Math.max(1, Math.floor(interpolate(frame, [60, 290], [1, 6.99], { extrapolateRight: "clamp" })))
  );

  const exitScale = interpolate(frame, [385, 420], [1, 0.92], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const exitOpacity = interpolate(frame, [390, 420], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        transform: `scale(${exitScale})`,
        opacity: exitOpacity,
      }}
    >
      <AmbientCanvas variant="rich" />

      {/* Left 3D Browser Stage with Playwright E-Contract Recording */}
      <Browser3DStage
        videoSrc="captures/contract.mp4"
        urlText="ambagan.finance/contract?plan=antipolo-trip"
        badgeText="E-CONTRACT GOVERNANCE"
        initialRotateY={14}
        targetRotateY={4}
        initialRotateX={7}
        targetRotateX={2}
        width={1060}
        height={720}
        cursorTargets={[
          { frame: 25, x: 0.35, y: 0.42, click: true },
          { frame: 130, x: 0.55, y: 0.58, click: false },
          { frame: 240, x: 0.48, y: 0.72, click: true },
          { frame: 350, x: 0.62, y: 0.66, click: true },
        ]}
        style={{
          position: "absolute",
          left: 64,
          top: 125,
          zIndex: 3,
        }}
      />

      {/* Right Editorial Header & Floating Callout Cards */}
      <div
        style={{
          position: "absolute",
          right: 76,
          top: 90,
          width: 610,
          zIndex: 5,
          transform: `translateX(${interpolate(headerSpring, [0, 1], [60, 0])}px)`,
          opacity: headerSpring,
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "6px 16px",
            borderRadius: 999,
            background: "rgba(14, 36, 28, 0.08)",
            color: COLORS.forest,
            fontFamily: FONTS.chivo,
            fontSize: 12.5,
            fontWeight: 700,
            letterSpacing: "0.08em",
            marginBottom: 16,
          }}
        >
          PROGRAMMABLE GROUP AGREEMENT
        </div>

        <h2
          style={{
            fontFamily: FONTS.serif,
            fontSize: 58,
            fontWeight: 700,
            lineHeight: 1.06,
            letterSpacing: "-0.02em",
            color: COLORS.forest,
            margin: "0 0 16px 0",
          }}
        >
          Every Member Signs Before a Single Peso Moves.
        </h2>

        <p
          style={{
            fontFamily: FONTS.sans,
            fontSize: 18.5,
            lineHeight: 1.55,
            color: COLORS.slate,
            margin: 0,
          }}
        >
          Payments stay locked until all participants review the split cadence,
          payout order, and draw their digital signature on the group contract.
        </p>
      </div>

      {/* Floating Bento Cards on the Right & Bottom-Left */}
      <BentoCard
        eyebrow="CONSENSUS SIGN-OFF"
        value={`${sigCount} / 6 Signed`}
        title="Cryptographic Group Consent"
        subtitle="Drawn or uploaded signatures bind each member slot to their Stellar wallet."
        accent="magenta"
        dark
        delayFrame={55}
        width={410}
        style={{
          position: "absolute",
          right: 110,
          top: 430,
          zIndex: 6,
        }}
      />

      <BentoCard
        eyebrow="CADENCE AUTOMATION"
        value="Bi-Weekly · ₱500"
        title="Antipolo Trip Pool (₱12,000)"
        subtitle="Automatically computes round deadlines, payout order, and vault shares."
        accent="emerald"
        delayFrame={135}
        width={410}
        style={{
          position: "absolute",
          right: 76,
          bottom: 85,
          zIndex: 7,
        }}
      />

      <BentoCard
        eyebrow="SAFETY LOCK"
        title="Payments Locked Until 100% Signed"
        subtitle="Zero surprise rule changes after the cycle begins."
        accent="lime"
        delayFrame={215}
        width={420}
        style={{
          position: "absolute",
          left: 110,
          bottom: 65,
          zIndex: 7,
        }}
      />
    </AbsoluteFill>
  );
};
