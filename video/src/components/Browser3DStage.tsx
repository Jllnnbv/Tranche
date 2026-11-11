import React from "react";
import {
  OffthreadVideo,
  staticFile,
  spring,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONTS } from "../theme";

export interface CursorTarget {
  frame: number;
  x: number; // 0..1 relative to browser content width
  y: number; // 0..1 relative to browser content height
  click?: boolean;
}

interface Browser3DStageProps {
  videoSrc: string;
  urlText: string;
  badgeText?: string;
  initialRotateY?: number;
  targetRotateY?: number;
  initialRotateX?: number;
  targetRotateX?: number;
  width?: number;
  height?: number;
  cursorTargets?: CursorTarget[];
  style?: React.CSSProperties;
}

export const Browser3DStage: React.FC<Browser3DStageProps> = ({
  videoSrc,
  urlText,
  badgeText = "LIVE STELLAR TESTNET",
  initialRotateY = -12,
  targetRotateY = 6,
  initialRotateX = 7,
  targetRotateX = 2,
  width = 1140,
  height = 760,
  cursorTargets = [],
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const entrance = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 110, mass: 0.9 },
  });

  // Smooth continuous 3D camera sweep across the scene duration
  const progress = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateRight: "clamp",
  });

  const rotY =
    interpolate(progress, [0, 0.5, 1], [initialRotateY, targetRotateY, initialRotateY * 0.4]) +
    Math.sin(frame / 35) * 1.8;
  const rotX =
    interpolate(progress, [0, 0.5, 1], [initialRotateX, targetRotateX, initialRotateX * 0.6]) +
    Math.cos(frame / 42) * 1.2;

  const scale = interpolate(entrance, [0, 1], [0.82, 1]) *
    interpolate(progress, [0, 0.55, 1], [0.98, 1.03, 1.0]);
  const translateY = interpolate(entrance, [0, 1], [90, 0]) + Math.sin(frame / 30) * 6;

  // Compute animated cursor position from cursorTargets
  let cursorX = 0.5;
  let cursorY = 0.5;
  let clickRipple = 0;

  if (cursorTargets.length >= 2) {
    const frames = cursorTargets.map((c) => c.frame);
    const xs = cursorTargets.map((c) => c.x);
    const ys = cursorTargets.map((c) => c.y);
    cursorX = interpolate(frame, frames, xs, {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    cursorY = interpolate(frame, frames, ys, {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });

    for (const target of cursorTargets) {
      if (target.click && frame >= target.frame && frame <= target.frame + 28) {
        clickRipple = (frame - target.frame) / 28;
      }
    }
  }

  const contentHeight = height - 52;

  return (
    <div
      style={{
        perspective: 1800,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...style,
      }}
    >
      <div
        style={{
          width,
          height,
          borderRadius: 28,
          background: "#0e241c",
          padding: 10,
          boxShadow: `
            0 45px 100px rgba(14, 36, 28, 0.32),
            0 16px 36px rgba(14, 36, 28, 0.18),
            0 0 0 1.5px rgba(255, 255, 255, 0.55),
            0 0 60px rgba(181, 72, 128, 0.18)
          `,
          transform: `translate3d(0, ${translateY}px, 0) scale(${scale}) rotateX(${rotX}deg) rotateY(${rotY}deg)`,
          transformStyle: "preserve-3d",
          position: "relative",
        }}
      >
        {/* Inner Browser Shell */}
        <div
          style={{
            width: "100%",
            height: "100%",
            borderRadius: 20,
            overflow: "hidden",
            background: "#f8faf0",
            display: "flex",
            flexDirection: "column",
            position: "relative",
          }}
        >
          {/* Sleek Arc/macOS Browser Top Chrome */}
          <div
            style={{
              height: 44,
              background: "linear-gradient(90deg, #0e241c 0%, #173a2b 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 18px",
              borderBottom: "1px solid rgba(225, 237, 160, 0.16)",
            }}
          >
            {/* Traffic Lights */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: "50%",
                  background: "#ff5f57",
                }}
              />
              <span
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: "50%",
                  background: "#febc2e",
                }}
              />
              <span
                style={{
                  width: 11,
                  height: 11,
                  borderRadius: "50%",
                  background: "#28c840",
                }}
              />
            </div>

            {/* URL Pill */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "5px 20px",
                borderRadius: 999,
                background: "rgba(255, 255, 255, 0.10)",
                border: "1px solid rgba(255, 255, 255, 0.14)",
                color: "#e1eda0",
                fontFamily: FONTS.chivo,
                fontSize: 12.5,
                letterSpacing: "0.02em",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <rect
                  x="4"
                  y="11"
                  width="16"
                  height="10"
                  rx="2"
                  stroke="#8ef0b8"
                  strokeWidth="2.2"
                />
                <path
                  d="M8 11V7a4 4 0 0 1 8 0v4"
                  stroke="#8ef0b8"
                  strokeWidth="2.2"
                />
              </svg>
              <span>{urlText}</span>
            </div>

            {/* Live Status Badge */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 12px",
                borderRadius: 999,
                background: "rgba(181, 72, 128, 0.28)",
                border: "1px solid rgba(244, 215, 230, 0.35)",
                color: "#ffd6ea",
                fontFamily: FONTS.chivo,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.06em",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#ff6eb6",
                  boxShadow: "0 0 8px #ff6eb6",
                }}
              />
              {badgeText}
            </div>
          </div>

          {/* Playwright Video Stage */}
          <div
            style={{
              width: "100%",
              height: contentHeight,
              position: "relative",
              overflow: "hidden",
              background: "#eef4d4",
            }}
          >
            <OffthreadVideo
              src={staticFile(videoSrc)}
              muted
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />

            {/* Animated Cursor & Click Spotlight Overlay */}
            {cursorTargets.length >= 2 && (
              <div
                style={{
                  position: "absolute",
                  left: cursorX * width - 16,
                  top: cursorY * contentHeight - 16,
                  pointerEvents: "none",
                  zIndex: 10,
                }}
              >
                {/* Click Ripple Ring */}
                {clickRipple > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      left: -24,
                      top: -24,
                      width: 80,
                      height: 80,
                      borderRadius: "50%",
                      border: `3px solid ${COLORS.magenta}`,
                      background: "rgba(181, 72, 128, 0.18)",
                      transform: `scale(${0.4 + clickRipple * 1.4})`,
                      opacity: 1 - clickRipple,
                    }}
                  />
                )}

                {/* Glowing Cursor Pointer */}
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: "50%",
                    background: "rgba(181, 72, 128, 0.25)",
                    border: "2px solid rgba(255, 255, 255, 0.9)",
                    boxShadow: "0 6px 20px rgba(181, 72, 128, 0.55)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M5 3l14 8-6.5 2L9 19.5 5 3z"
                      fill={COLORS.forest}
                      stroke="#ffffff"
                      strokeWidth="2"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
