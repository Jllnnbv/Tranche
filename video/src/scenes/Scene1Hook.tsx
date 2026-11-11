import React from "react";
import {
  AbsoluteFill,
  spring,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { AmbientCanvas } from "../components/AmbientCanvas";
import { COLORS, FONTS } from "../theme";

export const Scene1Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Phase 1 (0..165): The Problem of Traditional Paluwagan
  // Phase 2 (155..360): The Breakthrough — "No One Holds The Pot."
  const flipProgress = spring({
    frame: Math.max(0, frame - 155),
    fps,
    config: { damping: 14, stiffness: 120, mass: 0.9 },
  });

  const titleSpring = spring({
    frame,
    fps,
    config: { damping: 13, stiffness: 130 },
  });

  const card1Spring = spring({
    frame: Math.max(0, frame - 35),
    fps,
    config: { damping: 13, stiffness: 140 },
  });

  const card2Spring = spring({
    frame: Math.max(0, frame - 65),
    fps,
    config: { damping: 13, stiffness: 140 },
  });

  const card3Spring = spring({
    frame: Math.max(0, frame - 95),
    fps,
    config: { damping: 13, stiffness: 140 },
  });

  const floatWave = Math.sin(frame / 24) * 6;

  // Scene exit zoom
  const exitZoom = interpolate(frame, [325, 360], [1, 1.15], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const exitOpacity = interpolate(frame, [330, 360], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        transform: `scale(${exitZoom})`,
        opacity: exitOpacity,
      }}
    >
      <AmbientCanvas variant={frame < 165 ? "contrast" : "editorial"} />

      {/* Top Editorial Kicker Pill */}
      <div
        style={{
          position: "absolute",
          top: 76,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          transform: `translateY(${interpolate(titleSpring, [0, 1], [-40, 0])}px)`,
          opacity: titleSpring,
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 26px",
            borderRadius: 999,
            background:
              frame < 165
                ? "rgba(255, 255, 255, 0.1)"
                : "rgba(14, 36, 28, 0.92)",
            border: "1.5px solid rgba(225, 237, 160, 0.35)",
            color: COLORS.limeTop,
            fontFamily: FONTS.chivo,
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            boxShadow: "0 12px 32px rgba(14, 36, 28, 0.18)",
          }}
        >
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: frame < 165 ? "#ff6b6b" : "#4ade80",
              boxShadow:
                frame < 165 ? "0 0 10px #ff6b6b" : "0 0 10px #4ade80",
            }}
          />
          {frame < 165
            ? "THE GROUP SAVINGS DILEMMA"
            : "INTRODUCING AMBAGAN · ON STELLAR & PAIFLOW"}
        </div>
      </div>

      {/* Main Kinetic Typography Headline */}
      <div
        style={{
          position: "absolute",
          top: 155,
          left: 120,
          right: 120,
          textAlign: "center",
        }}
      >
        {frame < 165 ? (
          <div
            style={{
              transform: `translateY(${interpolate(
                titleSpring,
                [0, 1],
                [45, 0]
              )}px) scale(${interpolate(flipProgress, [0, 1], [1, 0.85])})`,
              opacity: interpolate(flipProgress, [0, 0.5], [1, 0], {
                extrapolateRight: "clamp",
              }),
            }}
          >
            <h1
              style={{
                fontFamily: FONTS.serif,
                fontSize: 82,
                fontWeight: 700,
                lineHeight: 1.06,
                letterSpacing: "-0.025em",
                color: COLORS.white,
                margin: 0,
              }}
            >
              Group saving shouldn&apos;t rely on{" "}
              <span
                style={{
                  fontStyle: "italic",
                  color: "#ff9ebb",
                  textDecoration: "underline",
                  textDecorationColor: COLORS.magenta,
                }}
              >
                blind trust.
              </span>
            </h1>
            <p
              style={{
                fontFamily: FONTS.sans,
                fontSize: 25,
                color: "rgba(255, 255, 255, 0.76)",
                marginTop: 20,
              }}
            >
              In traditional paluwagan, one person holds the entire pot —
              creating single-point custody risk.
            </p>
          </div>
        ) : (
          <div
            style={{
              transform: `translateY(${interpolate(
                flipProgress,
                [0, 1],
                [50, 0]
              )}px) scale(${interpolate(flipProgress, [0, 1], [0.88, 1])})`,
              opacity: flipProgress,
            }}
          >
            <h1
              style={{
                fontFamily: FONTS.serif,
                fontSize: 92,
                fontWeight: 700,
                lineHeight: 1.04,
                letterSpacing: "-0.03em",
                color: COLORS.forest,
                margin: 0,
              }}
            >
              With{" "}
              <span
                style={{
                  color: COLORS.magenta,
                  fontStyle: "italic",
                }}
              >
                Ambagan
              </span>
              , no single person holds the pot.
            </h1>
            <p
              style={{
                fontFamily: FONTS.sans,
                fontSize: 26,
                fontWeight: 500,
                color: COLORS.forestMid,
                marginTop: 18,
              }}
            >
              Every contribution splits automatically on-chain via programmable
              Paiflow smart rules.
            </p>
          </div>
        )}
      </div>

      {/* 3 Transforming Comparison Cards */}
      <div
        style={{
          position: "absolute",
          bottom: 95,
          left: 110,
          right: 110,
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 32,
          perspective: 1400,
        }}
      >
        {[
          {
            sp: card1Spring,
            oldTag: "CUSTODY RISK",
            oldTitle: "One Collector Holds Cash",
            oldDesc: "Funds sit in a personal account vulnerable to delays or default.",
            newTag: "NON-CUSTODIAL ENGINE",
            newTitle: "Zero Middlemen Custody",
            newDesc: "Smart contracts route every peso/XLM the second it arrives.",
            accent: COLORS.emeraldBright,
          },
          {
            sp: card2Spring,
            oldTag: "MANUAL TRACKING",
            oldTitle: "Messy Chat Spreadsheets",
            oldDesc: "Screenshots in group chats with no cryptographic proof of payment.",
            newTag: "100% TRANSPARENT",
            newTitle: "Live On-Chain Ledger",
            newDesc: "Every round, split, and payout is verifiable on Stellar Testnet.",
            accent: COLORS.magenta,
          },
          {
            sp: card3Spring,
            oldTag: "LATE DEFAULTS",
            oldTitle: "Unprotected Group Pot",
            oldDesc: "If a member ghosts after receiving early, the whole group loses.",
            newTag: "3-OF-5 MULTISIG VAULT",
            newTitle: "20% Vault + 3% Safety Buffer",
            newDesc: "Collateral stays locked until the cycle completes with group sign-off.",
            accent: "#17422f",
          },
        ].map((item, idx) => {
          const isFlipped = frame >= 165 + idx * 8;
          const cardFlip = spring({
            frame: Math.max(0, frame - (160 + idx * 8)),
            fps,
            config: { damping: 13, stiffness: 130 },
          });

          const rotY = interpolate(cardFlip, [0, 1], [0, 360]);
          const yOffset =
            interpolate(item.sp, [0, 1], [80, 0]) +
            Math.sin((frame + idx * 25) / 22) * 6;

          return (
            <div
              key={idx}
              style={{
                padding: "32px 30px",
                borderRadius: 28,
                background: isFlipped
                  ? "rgba(255, 255, 255, 0.9)"
                  : "rgba(255, 255, 255, 0.08)",
                backdropFilter: "blur(18px)",
                border: isFlipped
                  ? "2px solid rgba(14, 36, 28, 0.12)"
                  : "1.5px solid rgba(255, 120, 150, 0.28)",
                boxShadow: isFlipped
                  ? "0 28px 60px rgba(14, 36, 28, 0.14)"
                  : "0 24px 50px rgba(0, 0, 0, 0.35)",
                transform: `translateY(${yOffset + floatWave * (idx % 2 === 0 ? 1 : -1)}px) rotateY(${rotY}deg) scale(${item.sp})`,
                color: isFlipped ? COLORS.forest : COLORS.white,
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 14px",
                  borderRadius: 999,
                  background: isFlipped
                    ? "rgba(31, 110, 70, 0.12)"
                    : "rgba(255, 95, 87, 0.2)",
                  color: isFlipped ? item.accent : "#ff9ea2",
                  fontFamily: FONTS.chivo,
                  fontSize: 12.5,
                  fontWeight: 700,
                  letterSpacing: "0.07em",
                  marginBottom: 16,
                }}
              >
                <span>{isFlipped ? "✓" : "✕"}</span>
                <span>{isFlipped ? item.newTag : item.oldTag}</span>
              </div>

              <div
                style={{
                  fontFamily: FONTS.serif,
                  fontSize: 30,
                  fontWeight: 700,
                  lineHeight: 1.18,
                  marginBottom: 10,
                }}
              >
                {isFlipped ? item.newTitle : item.oldTitle}
              </div>

              <div
                style={{
                  fontFamily: FONTS.sans,
                  fontSize: 16,
                  lineHeight: 1.5,
                  color: isFlipped
                    ? COLORS.slate
                    : "rgba(255, 255, 255, 0.72)",
                }}
              >
                {isFlipped ? item.newDesc : item.oldDesc}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
