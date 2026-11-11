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

export const Scene5Dashboard: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerSpring = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 120 },
  });

  const settledAnimated = Math.min(
    12000,
    Math.round(
      interpolate(frame, [30, 260], [2000, 12000], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    )
  ).toLocaleString();

  const exitScale = interpolate(frame, [385, 420], [1, 1.08], {
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
      <AmbientCanvas variant="editorial" />

      {/* Top Left Editorial Header */}
      <div
        style={{
          position: "absolute",
          left: 84,
          top: 72,
          width: 620,
          zIndex: 5,
          transform: `translateY(${interpolate(headerSpring, [0, 1], [-45, 0])}px)`,
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
            background: COLORS.forest,
            color: COLORS.limeTop,
            fontFamily: FONTS.chivo,
            fontSize: 12.5,
            fontWeight: 700,
            letterSpacing: "0.08em",
            marginBottom: 14,
          }}
        >
          LIVE GROUP DASHBOARD & CHECKOUT
        </div>

        <h2
          style={{
            fontFamily: FONTS.serif,
            fontSize: 56,
            fontWeight: 700,
            lineHeight: 1.06,
            letterSpacing: "-0.02em",
            color: COLORS.forest,
            margin: "0 0 14px 0",
          }}
        >
          Pay with GCash, Maya, or Stellar. Track Every Slot Live.
        </h2>

        <p
          style={{
            fontFamily: FONTS.sans,
            fontSize: 18,
            lineHeight: 1.5,
            color: COLORS.slate,
            margin: 0,
          }}
        >
          Local payment rails meet on-chain finality. Watch contributions
          settle in real time with verifiable receipt hashes and multisig vault
          protection.
        </p>
      </div>

      {/* Right 3D Browser Stage with Live Dashboard + Payment Recording */}
      <Browser3DStage
        videoSrc="captures/dashboard.mp4"
        urlText="ambagan.finance/group?plan=antipolo-trip"
        badgeText="VERIFIED ON-CHAIN"
        initialRotateY={-14}
        targetRotateY={-3}
        initialRotateX={6}
        targetRotateX={2}
        width={1080}
        height={730}
        cursorTargets={[
          { frame: 30, x: 0.45, y: 0.48, click: false },
          { frame: 135, x: 0.32, y: 0.52, click: true },
          { frame: 235, x: 0.56, y: 0.68, click: true },
          { frame: 335, x: 0.5, y: 0.45, click: false },
        ]}
        style={{
          position: "absolute",
          right: 60,
          top: 120,
          zIndex: 3,
        }}
      />

      {/* Floating HUD Cards */}
      <BentoCard
        eyebrow="POOL PROGRESS"
        value={`₱${settledAnimated}`}
        title="Live Round Settlement"
        subtitle="Donut chart & slot badges update the moment Paiflow confirms SUCCESS."
        accent="emerald"
        delayFrame={50}
        width={390}
        style={{
          position: "absolute",
          left: 84,
          top: 415,
          zIndex: 6,
        }}
      />

      <BentoCard
        eyebrow="3-OF-5 MULTISIG VAULT"
        value="Threshold: 3 Signers"
        title="Collaborative Vault Release"
        subtitle="Vault & Safety Fund payouts require group consensus on Stellar Horizon."
        accent="magenta"
        dark
        delayFrame={130}
        width={410}
        style={{
          position: "absolute",
          left: 84,
          bottom: 72,
          zIndex: 7,
        }}
      />

      <BentoCard
        eyebrow="RECEIPT PROOF"
        value="TXN Verified"
        title="Immutable Audit Trail"
        subtitle="Downloadable receipt with timestamp, round slot, and Stellar ledger hash."
        accent="lime"
        delayFrame={210}
        width={380}
        style={{
          position: "absolute",
          right: 84,
          bottom: 62,
          zIndex: 7,
        }}
      />
    </AbsoluteFill>
  );
};
