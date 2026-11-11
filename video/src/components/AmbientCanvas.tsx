import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { COLORS } from "../theme";

interface AmbientCanvasProps {
  variant?: "editorial" | "contrast" | "rich";
}

export const AmbientCanvas: React.FC<AmbientCanvasProps> = ({
  variant = "editorial",
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  // Continuous sinusoidal motion for organic floating blobs
  const t = frame / 60;
  const orb1X = Math.sin(t * 0.7) * 140;
  const orb1Y = Math.cos(t * 0.5) * 90;

  const orb2X = Math.cos(t * 0.6) * 160;
  const orb2Y = Math.sin(t * 0.8) * 110;

  const orb3X = Math.sin(t * 0.9 + 1.4) * 120;
  const orb3Y = Math.cos(t * 0.7 + 0.8) * 85;

  const gridShiftX = (frame * 0.45) % 64;
  const gridShiftY = (frame * 0.3) % 64;

  const isContrast = variant === "contrast";

  const bgGradient = isContrast
    ? `radial-gradient(circle at 20% 20%, #173d2c 0%, ${COLORS.forest} 65%, #07140f 100%)`
    : variant === "rich"
    ? `linear-gradient(135deg, #d9ea8a 0%, #eff6d0 48%, #ffffff 100%)`
    : `linear-gradient(180deg, ${COLORS.limeTop} 0%, #f3f8dc 52%, ${COLORS.white} 100%)`;

  const gridColor = isContrast
    ? "rgba(225, 237, 160, 0.055)"
    : "rgba(14, 36, 28, 0.045)";

  const pulseScale = interpolate(Math.sin(t * 1.5), [-1, 1], [0.94, 1.08]);

  return (
    <AbsoluteFill
      style={{
        background: bgGradient,
        overflow: "hidden",
      }}
    >
      {/* Drifting lime/white aura blob top-left */}
      <div
        style={{
          position: "absolute",
          width: 780,
          height: 780,
          left: -120 + orb1X,
          top: -220 + orb1Y,
          borderRadius: "50%",
          background: isContrast
            ? "radial-gradient(circle, rgba(225,237,160,0.18) 0%, rgba(225,237,160,0) 70%)"
            : "radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 70%)",
          filter: "blur(50px)",
          transform: `scale(${pulseScale})`,
        }}
      />

      {/* Drifting Ambagan magenta glow orb */}
      <div
        style={{
          position: "absolute",
          width: 680,
          height: 680,
          right: -80 + orb2X,
          top: height * 0.15 + orb2Y,
          borderRadius: "50%",
          background: isContrast
            ? "radial-gradient(circle, rgba(181,72,128,0.28) 0%, rgba(181,72,128,0) 70%)"
            : "radial-gradient(circle, rgba(181,72,128,0.18) 0%, rgba(181,72,128,0) 72%)",
          filter: "blur(60px)",
        }}
      />

      {/* Drifting mint/emerald bottom orb */}
      <div
        style={{
          position: "absolute",
          width: 820,
          height: 820,
          left: width * 0.28 + orb3X,
          bottom: -280 + orb3Y,
          borderRadius: "50%",
          background: isContrast
            ? "radial-gradient(circle, rgba(53,161,103,0.22) 0%, rgba(53,161,103,0) 70%)"
            : "radial-gradient(circle, rgba(184,230,168,0.65) 0%, rgba(184,230,168,0) 70%)",
          filter: "blur(55px)",
        }}
      />

      {/* Continuous parallax architectural grid */}
      <div
        style={{
          position: "absolute",
          inset: -128,
          backgroundImage: `
            linear-gradient(to right, ${gridColor} 1px, transparent 1px),
            linear-gradient(to bottom, ${gridColor} 1px, transparent 1px)
          `,
          backgroundSize: "64px 64px",
          transform: `translate3d(${gridShiftX}px, ${gridShiftY}px, 0)`,
        }}
      />

      {/* Subtle floating geometric particles */}
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const px = ((i * 337 + 140) % (width - 200)) + Math.sin(t * (0.6 + i * 0.15) + i) * 45;
        const py = ((i * 193 + 120) % (height - 160)) + Math.cos(t * (0.5 + i * 0.12) + i) * 35;
        const size = 8 + (i % 3) * 4;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: px,
              top: py,
              width: size,
              height: size,
              borderRadius: "50%",
              background:
                i % 2 === 0
                  ? isContrast
                    ? "rgba(225, 237, 160, 0.35)"
                    : "rgba(14, 36, 28, 0.14)"
                  : "rgba(181, 72, 128, 0.32)",
              boxShadow:
                i % 2 === 1 ? "0 0 16px rgba(181, 72, 128, 0.4)" : "none",
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
