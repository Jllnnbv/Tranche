import React from "react";
import { spring, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONTS } from "../theme";

export interface BentoCardProps {
  eyebrow: string;
  title: string;
  value?: string;
  subtitle?: string;
  accent?: "emerald" | "magenta" | "lime" | "amber";
  delayFrame?: number;
  dark?: boolean;
  width?: number;
  icon?: React.ReactNode;
  style?: React.CSSProperties;
}

export const BentoCard: React.FC<BentoCardProps> = ({
  eyebrow,
  title,
  value,
  subtitle,
  accent = "emerald",
  delayFrame = 0,
  dark = false,
  width = 360,
  icon,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const localFrame = Math.max(0, frame - delayFrame);
  const pop = spring({
    frame: localFrame,
    fps,
    config: { damping: 13, stiffness: 150, mass: 0.8 },
  });

  // Continuous subtle levitation after entrance
  const floatY = Math.sin((frame + delayFrame * 2) / 28) * 5;
  const tiltZ = Math.cos((frame + delayFrame) / 40) * 0.6;

  const translateY = interpolate(pop, [0, 1], [48, 0]) + floatY;
  const scale = interpolate(pop, [0, 1], [0.84, 1]);
  const opacity = interpolate(localFrame, [0, 10], [0, 1], {
    extrapolateRight: "clamp",
  });

  const accentMap = {
    emerald: {
      dot: "#259c5c",
      badgeBg: dark ? "rgba(37, 156, 92, 0.22)" : "rgba(37, 156, 92, 0.12)",
      badgeText: dark ? "#8ef0b8" : "#145c35",
      glow: "rgba(37, 156, 92, 0.25)",
    },
    magenta: {
      dot: COLORS.magenta,
      badgeBg: dark ? "rgba(181, 72, 128, 0.26)" : "rgba(181, 72, 128, 0.13)",
      badgeText: dark ? "#f9b8d8" : "#962d64",
      glow: "rgba(181, 72, 128, 0.28)",
    },
    lime: {
      dot: "#94b816",
      badgeBg: dark ? "rgba(225, 237, 160, 0.2)" : "rgba(225, 237, 160, 0.65)",
      badgeText: dark ? "#e1eda0" : COLORS.forest,
      glow: "rgba(225, 237, 160, 0.35)",
    },
    amber: {
      dot: "#e68a00",
      badgeBg: dark ? "rgba(230, 138, 0, 0.22)" : "rgba(230, 138, 0, 0.14)",
      badgeText: dark ? "#ffd280" : "#945700",
      glow: "rgba(230, 138, 0, 0.25)",
    },
  }[accent];

  return (
    <div
      style={{
        width,
        padding: "22px 26px",
        borderRadius: 24,
        background: dark ? COLORS.darkGlassBg : COLORS.glassBg,
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        border: `1.5px solid ${dark ? COLORS.darkGlassBorder : COLORS.glassBorder}`,
        boxShadow: dark
          ? `0 24px 52px rgba(0, 0, 0, 0.42), 0 0 28px ${accentMap.glow}`
          : `0 22px 48px rgba(14, 36, 28, 0.14), 0 4px 16px ${accentMap.glow}`,
        color: dark ? COLORS.white : COLORS.forest,
        fontFamily: FONTS.sans,
        transform: `translate3d(0, ${translateY}px, 0) scale(${scale}) rotate(${tiltZ}deg)`,
        opacity,
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "5px 12px",
            borderRadius: 999,
            background: accentMap.badgeBg,
            color: accentMap.badgeText,
            fontFamily: FONTS.chivo,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: accentMap.dot,
              boxShadow: `0 0 8px ${accentMap.dot}`,
            }}
          />
          {eyebrow}
        </span>
        {icon && <div>{icon}</div>}
      </div>

      {value && (
        <div
          style={{
            fontFamily: FONTS.serif,
            fontSize: 36,
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            marginBottom: 4,
            color: dark ? COLORS.limeTop : COLORS.forest,
          }}
        >
          {value}
        </div>
      )}

      <div
        style={{
          fontFamily: FONTS.chivo,
          fontSize: 18,
          fontWeight: 700,
          lineHeight: 1.25,
          marginBottom: subtitle ? 6 : 0,
        }}
      >
        {title}
      </div>

      {subtitle && (
        <div
          style={{
            fontSize: 13.5,
            lineHeight: 1.45,
            color: dark ? "rgba(255,255,255,0.74)" : COLORS.slate,
          }}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
};
