import React from "react";
import {
  AbsoluteFill,
  Img,
  staticFile,
  spring,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { AmbientCanvas } from "../components/AmbientCanvas";
import { Browser3DStage } from "../components/Browser3DStage";
import { BentoCard } from "../components/BentoCard";
import { COLORS, FONTS } from "../theme";

export const Scene2Hero: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerSpring = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 120 },
  });

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
      <AmbientCanvas variant="editorial" />

      {/* Left Editorial Brand Lockup & Narrative */}
      <div
        style={{
          position: "absolute",
          left: 86,
          top: 95,
          width: 560,
          zIndex: 5,
          transform: `translateX(${interpolate(headerSpring, [0, 1], [-60, 0])}px)`,
          opacity: headerSpring,
        }}
      >
        {/* Brand Badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 12,
            padding: "8px 20px 8px 12px",
            borderRadius: 999,
            background: "rgba(255, 255, 255, 0.85)",
            border: "1.5px solid rgba(14, 36, 28, 0.1)",
            boxShadow: "0 10px 28px rgba(14, 36, 28, 0.08)",
            marginBottom: 24,
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: "radial-gradient(circle, #f4b8d4 0%, #b54880 75%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 14px rgba(181, 72, 128, 0.45)",
            }}
          >
            <Img
              src={staticFile("brand/logo.svg")}
              style={{ width: 22, height: 22 }}
            />
          </div>
          <span
            style={{
              fontFamily: FONTS.serif,
              fontSize: 22,
              fontWeight: 700,
              color: COLORS.forest,
            }}
          >
            Ambagan
          </span>
          <span
            style={{
              padding: "3px 10px",
              borderRadius: 999,
              background: "rgba(31, 110, 70, 0.12)",
              color: COLORS.emerald,
              fontFamily: FONTS.chivo,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.06em",
            }}
          >
            PAIFLOW × STELLAR
          </span>
        </div>

        <div
          style={{
            fontFamily: FONTS.serif,
            fontSize: 26,
            color: COLORS.magenta,
            fontStyle: "italic",
            marginBottom: 8,
          }}
        >
          Secure the Split, Scale the Synergy
        </div>

        <h2
          style={{
            fontFamily: FONTS.serif,
            fontSize: 64,
            fontWeight: 700,
            lineHeight: 1.04,
            letterSpacing: "-0.025em",
            color: COLORS.forest,
            margin: "0 0 18px 0",
          }}
        >
          Blockchain Infrastructure for Shared Value.
        </h2>

        <p
          style={{
            fontFamily: FONTS.sans,
            fontSize: 19,
            lineHeight: 1.55,
            color: COLORS.slate,
            margin: 0,
            maxWidth: 490,
          }}
        >
          Deconstruct group savings into programmable portions with automated
          splits, digital e-contracts, and multisig vault protection.
        </p>
      </div>

      {/* Right 3D Perspective Browser Stage with Live Playwright Recording */}
      <Browser3DStage
        videoSrc="captures/hero.mp4"
        urlText="ambagan.finance — Non-Custodial Group Savings"
        badgeText="100% ON-CHAIN"
        initialRotateY={-16}
        targetRotateY={-5}
        initialRotateX={8}
        targetRotateX={3}
        width={1080}
        height={730}
        cursorTargets={[
          { frame: 20, x: 0.25, y: 0.62, click: false },
          { frame: 95, x: 0.34, y: 0.62, click: true },
          { frame: 210, x: 0.52, y: 0.55, click: false },
          { frame: 300, x: 0.21, y: 0.61, click: true },
          { frame: 390, x: 0.48, y: 0.52, click: false },
        ]}
        style={{
          position: "absolute",
          right: 64,
          top: 120,
          zIndex: 3,
        }}
      />

      {/* Floating Glassmorphic Bento Highlight Cards */}
      <BentoCard
        eyebrow="SMART SPLIT ENGINE"
        value="100%"
        title="Transparent & Non-Custodial"
        subtitle="Funds route directly from contributor to receiver, Vault & Safety Fund."
        accent="emerald"
        delayFrame={50}
        width={380}
        style={{
          position: "absolute",
          left: 86,
          bottom: 225,
          zIndex: 6,
        }}
      />

      <BentoCard
        eyebrow="PAIFLOW PROTOCOL"
        value="0 Middlemen"
        title="Automated Stellar Settlement"
        subtitle="Every payment is cryptographically signed and settled in seconds."
        accent="magenta"
        delayFrame={140}
        dark
        width={390}
        style={{
          position: "absolute",
          left: 490,
          bottom: 68,
          zIndex: 7,
        }}
      />

      <BentoCard
        eyebrow="INSTANT ONBOARDING"
        title="Familiar Filipino UX"
        subtitle="Sign up with email, review the visual split diagram, and join a group in under 60 seconds."
        accent="lime"
        delayFrame={235}
        width={365}
        style={{
          position: "absolute",
          right: 76,
          bottom: 64,
          zIndex: 7,
        }}
      />
    </AbsoluteFill>
  );
};
