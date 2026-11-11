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
import { COLORS, FONTS } from "../theme";

export const Scene6Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoSpring = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 120 },
  });

  const headlineSpring = spring({
    frame: Math.max(0, frame - 20),
    fps,
    config: { damping: 13, stiffness: 125 },
  });

  const pillsSpring = spring({
    frame: Math.max(0, frame - 45),
    fps,
    config: { damping: 14, stiffness: 130 },
  });

  const ctaSpring = spring({
    frame: Math.max(0, frame - 75),
    fps,
    config: { damping: 12, stiffness: 140 },
  });

  const pulseGlow = interpolate(Math.sin(frame / 16), [-1, 1], [0.95, 1.07]);

  return (
    <AbsoluteFill>
      <AmbientCanvas variant="editorial" />

      {/* Decorative Hero Illustration Silhouette on Right */}
      <Img
        src={staticFile("brand/hero.svg")}
        style={{
          position: "absolute",
          right: -60,
          bottom: -40,
          width: 780,
          opacity: 0.24,
          transform: `translateY(${Math.sin(frame / 28) * 10}px)`,
        }}
      />

      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "0 140px",
        }}
      >
        {/* Glowing Ambagan Emblem */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            marginBottom: 26,
            transform: `scale(${logoSpring * pulseGlow})`,
            opacity: logoSpring,
          }}
        >
          <div
            style={{
              width: 86,
              height: 86,
              borderRadius: "50%",
              background:
                "radial-gradient(circle at 30% 30%, #f7cae0 0%, #b54880 65%, #5c2544 100%)",
              boxShadow: "0 18px 50px rgba(181, 72, 128, 0.48)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Img
              src={staticFile("brand/logo.svg")}
              style={{ width: 52, height: 52 }}
            />
          </div>
          <span
            style={{
              fontFamily: FONTS.serif,
              fontSize: 64,
              fontWeight: 700,
              color: COLORS.forest,
              letterSpacing: "-0.02em",
            }}
          >
            Ambagan
          </span>
        </div>

        {/* Main Tagline */}
        <div
          style={{
            transform: `translateY(${interpolate(headlineSpring, [0, 1], [40, 0])}px)`,
            opacity: headlineSpring,
          }}
        >
          <div
            style={{
              fontFamily: FONTS.serif,
              fontSize: 32,
              fontStyle: "italic",
              color: COLORS.magenta,
              marginBottom: 10,
            }}
          >
            Secure the Split, Scale the Synergy
          </div>

          <h1
            style={{
              fontFamily: FONTS.serif,
              fontSize: 84,
              fontWeight: 700,
              lineHeight: 1.04,
              letterSpacing: "-0.03em",
              color: COLORS.forest,
              margin: "0 0 28px 0",
              maxWidth: 1320,
            }}
          >
            The Future of Community Saving is On-Chain.
          </h1>
        </div>

        {/* 4 Animated Feature Pills */}
        <div
          style={{
            display: "flex",
            gap: 18,
            flexWrap: "wrap",
            justifyContent: "center",
            marginBottom: 44,
            transform: `translateY(${interpolate(pillsSpring, [0, 1], [32, 0])}px)`,
            opacity: pillsSpring,
          }}
        >
          {[
            ["77 / 20 / 3", "Automated Split"],
            ["3-of-5", "Multisig Vault"],
            ["100%", "On-Chain Transparency"],
            ["Paiflow × Stellar", "Smart Infrastructure"],
          ].map(([big, label], i) => (
            <div
              key={i}
              style={{
                padding: "16px 28px",
                borderRadius: 22,
                background: "rgba(255, 255, 255, 0.88)",
                border: "1.5px solid rgba(14, 36, 28, 0.12)",
                boxShadow: "0 16px 36px rgba(14, 36, 28, 0.08)",
                display: "flex",
                alignItems: "center",
                gap: 12,
                transform: `translateY(${Math.sin((frame + i * 20) / 22) * 4}px)`,
              }}
            >
              <span
                style={{
                  fontFamily: FONTS.serif,
                  fontSize: 24,
                  fontWeight: 700,
                  color: COLORS.magenta,
                }}
              >
                {big}
              </span>
              <span
                style={{
                  fontFamily: FONTS.chivo,
                  fontSize: 15,
                  fontWeight: 600,
                  color: COLORS.forest,
                }}
              >
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* CTA Button & URL Lockup */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            transform: `scale(${ctaSpring * pulseGlow})`,
            opacity: ctaSpring,
          }}
        >
          <div
            style={{
              padding: "22px 48px",
              borderRadius: 999,
              background: "linear-gradient(90deg, #0e241c 0%, #1f5c3c 100%)",
              color: COLORS.white,
              fontFamily: FONTS.chivo,
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: "0.02em",
              boxShadow: "0 24px 50px rgba(14, 36, 28, 0.3)",
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <span>Start Saving with Ambagan</span>
            <span style={{ color: COLORS.limeTop }}>→</span>
          </div>

          <div
            style={{
              padding: "20px 36px",
              borderRadius: 999,
              background: "rgba(255, 255, 255, 0.9)",
              border: "2px solid rgba(14, 36, 28, 0.15)",
              color: COLORS.forest,
              fontFamily: FONTS.chivo,
              fontSize: 22,
              fontWeight: 700,
            }}
          >
            ambagan.finance
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
