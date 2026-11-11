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

export const Scene3SplitEngine: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerSpring = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 120 },
  });

  const poolSpring = spring({
    frame: Math.max(0, frame - 25),
    fps,
    config: { damping: 12, stiffness: 130 },
  });

  const engineSpring = spring({
    frame: Math.max(0, frame - 65),
    fps,
    config: { damping: 13, stiffness: 125 },
  });

  // 3 Split Destination Cards (77% / 20% / 3%)
  const split1Spring = spring({
    frame: Math.max(0, frame - 115),
    fps,
    config: { damping: 13, stiffness: 130 },
  });
  const split2Spring = spring({
    frame: Math.max(0, frame - 155),
    fps,
    config: { damping: 13, stiffness: 130 },
  });
  const split3Spring = spring({
    frame: Math.max(0, frame - 195),
    fps,
    config: { damping: 13, stiffness: 130 },
  });

  // Animated counting numbers
  const countProgress = interpolate(frame, [115, 250], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const pctNow = Math.round(77 * countProgress);
  const pctVault = Math.round(20 * countProgress);
  const pctFund = Math.round(3 * countProgress);

  const amtNow = Math.round(9240 * countProgress).toLocaleString();
  const amtVault = Math.round(2400 * countProgress).toLocaleString();
  const amtFund = Math.round(360 * countProgress).toLocaleString();

  // Animated energy pulses flowing along SVG paths
  const pulseOffset = -(frame * 5.5) % 48;

  const exitOpacity = interpolate(frame, [448, 480], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity: exitOpacity }}>
      <AmbientCanvas variant="contrast" />

      {/* Scene Header */}
      <div
        style={{
          position: "absolute",
          top: 56,
          left: 100,
          right: 100,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          transform: `translateY(${interpolate(headerSpring, [0, 1], [-40, 0])}px)`,
          opacity: headerSpring,
        }}
      >
        <div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "6px 18px",
              borderRadius: 999,
              background: "rgba(225, 237, 160, 0.14)",
              border: "1px solid rgba(225, 237, 160, 0.35)",
              color: COLORS.limeTop,
              fontFamily: FONTS.chivo,
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.08em",
              marginBottom: 14,
            }}
          >
            NON-CUSTODIAL AMBAGAN ENGINE · PAIFLOW SMART SPLIT
          </div>
          <h2
            style={{
              fontFamily: FONTS.serif,
              fontSize: 62,
              fontWeight: 700,
              lineHeight: 1.05,
              color: COLORS.white,
              margin: 0,
            }}
          >
            Every Contribution Splits{" "}
            <span style={{ color: COLORS.limeTop, fontStyle: "italic" }}>
              Automatically.
            </span>
          </h2>
        </div>

        {/* Live Contract Pill */}
        <div
          style={{
            padding: "14px 24px",
            borderRadius: 20,
            background: "rgba(255, 255, 255, 0.08)",
            border: "1px solid rgba(255, 255, 255, 0.16)",
            color: COLORS.white,
            fontFamily: FONTS.chivo,
            fontSize: 14,
            textAlign: "right",
          }}
        >
          <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, marginBottom: 4 }}>
            STELLAR TESTNET CONTRACT
          </div>
          <div style={{ color: "#8ef0b8", fontWeight: 700 }}>
            CBNUC5…LDWO · 10,000 BPS VERIFIED
          </div>
        </div>
      </div>

      {/* Interactive SVG Flow Lines Connecting Pool -> Engine -> 3 Splits */}
      <svg
        width="1920"
        height="1080"
        viewBox="0 0 1920 1080"
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      >
        <defs>
          <linearGradient id="lineGradEmerald" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#e1eda0" />
            <stop offset="100%" stopColor="#4ade80" />
          </linearGradient>
          <linearGradient id="lineGradMagenta" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#e1eda0" />
            <stop offset="100%" stopColor="#f472b6" />
          </linearGradient>
          <linearGradient id="lineGradAmber" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#e1eda0" />
            <stop offset="100%" stopColor="#fbbf24" />
          </linearGradient>
        </defs>

        {/* Input Pool -> Paiflow Engine */}
        <path
          d="M 470 590 L 690 590"
          stroke="rgba(225, 237, 160, 0.25)"
          strokeWidth="4"
          fill="none"
        />
        <path
          d="M 470 590 L 690 590"
          stroke="#e1eda0"
          strokeWidth="5"
          strokeDasharray="16 32"
          strokeDashoffset={pulseOffset}
          strokeLinecap="round"
          fill="none"
        />

        {/* Engine -> Top Card (77%) */}
        <path
          d="M 1050 540 C 1140 540, 1140 355, 1240 355"
          stroke="rgba(74, 222, 128, 0.25)"
          strokeWidth="4"
          fill="none"
        />
        <path
          d="M 1050 540 C 1140 540, 1140 355, 1240 355"
          stroke="url(#lineGradEmerald)"
          strokeWidth="5"
          strokeDasharray="16 32"
          strokeDashoffset={pulseOffset}
          strokeLinecap="round"
          fill="none"
        />

        {/* Engine -> Middle Card (20%) */}
        <path
          d="M 1050 590 L 1240 590"
          stroke="rgba(244, 114, 182, 0.25)"
          strokeWidth="4"
          fill="none"
        />
        <path
          d="M 1050 590 L 1240 590"
          stroke="url(#lineGradMagenta)"
          strokeWidth="5"
          strokeDasharray="16 32"
          strokeDashoffset={pulseOffset}
          strokeLinecap="round"
          fill="none"
        />

        {/* Engine -> Bottom Card (3%) */}
        <path
          d="M 1050 640 C 1140 640, 1140 825, 1240 825"
          stroke="rgba(251, 191, 36, 0.25)"
          strokeWidth="4"
          fill="none"
        />
        <path
          d="M 1050 640 C 1140 640, 1140 825, 1240 825"
          stroke="url(#lineGradAmber)"
          strokeWidth="5"
          strokeDasharray="16 32"
          strokeDashoffset={pulseOffset}
          strokeLinecap="round"
          fill="none"
        />
      </svg>

      {/* Node 1: Left Deposit Pool Card */}
      <div
        style={{
          position: "absolute",
          left: 100,
          top: 430,
          width: 370,
          padding: "34px 30px",
          borderRadius: 28,
          background: "rgba(255, 255, 255, 0.94)",
          color: COLORS.forest,
          boxShadow: "0 30px 70px rgba(0, 0, 0, 0.4)",
          transform: `scale(${poolSpring}) translateY(${Math.sin(frame / 25) * 6}px)`,
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "5px 12px",
            borderRadius: 999,
            background: "rgba(14, 36, 28, 0.08)",
            fontFamily: FONTS.chivo,
            fontSize: 12,
            fontWeight: 700,
            marginBottom: 14,
          }}
        >
          STEP 1 · GROUP DEPOSIT POOL
        </div>
        <div
          style={{
            fontFamily: FONTS.serif,
            fontSize: 46,
            fontWeight: 700,
            color: COLORS.forest,
            marginBottom: 6,
          }}
        >
          ₱12,000
        </div>
        <div
          style={{
            fontFamily: FONTS.chivo,
            fontSize: 17,
            fontWeight: 700,
            color: COLORS.emerald,
            marginBottom: 12,
          }}
        >
          6 Members × ₱2,000 Round Pool
        </div>
        <div
          style={{
            fontFamily: FONTS.sans,
            fontSize: 14.5,
            lineHeight: 1.5,
            color: COLORS.slate,
          }}
        >
          All group members send their contribution to a single transparent
          on-chain address.
        </div>
      </div>

      {/* Node 2: Center Paiflow Smart Split Engine Hub */}
      <div
        style={{
          position: "absolute",
          left: 690,
          top: 415,
          width: 360,
          height: 350,
          borderRadius: 34,
          background:
            "linear-gradient(145deg, rgba(225,237,160,0.18) 0%, rgba(181,72,128,0.25) 100%)",
          border: "2px solid rgba(225, 237, 160, 0.45)",
          backdropFilter: "blur(22px)",
          boxShadow:
            "0 30px 80px rgba(0, 0, 0, 0.5), 0 0 60px rgba(181, 72, 128, 0.3)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 28,
          textAlign: "center",
          color: COLORS.white,
          transform: `scale(${engineSpring}) translateY(${Math.cos(frame / 28) * 6}px)`,
        }}
      >
        {/* Rotating Orbital Ring */}
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: "50%",
            border: "2.5px dashed #e1eda0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 18,
            transform: `rotate(${frame * 1.4}deg)`,
          }}
        >
          <div
            style={{
              width: 68,
              height: 68,
              borderRadius: "50%",
              background: COLORS.limeTop,
              color: COLORS.forest,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: FONTS.chivo,
              fontWeight: 700,
              fontSize: 15,
              transform: `rotate(${-frame * 1.4}deg)`,
              boxShadow: "0 0 24px rgba(225, 237, 160, 0.65)",
            }}
          >
            SPLIT
          </div>
        </div>

        <div
          style={{
            fontFamily: FONTS.chivo,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: COLORS.limeTop,
            marginBottom: 6,
          }}
        >
          STEP 2 · AUTOMATED EXECUTION
        </div>
        <div
          style={{
            fontFamily: FONTS.serif,
            fontSize: 30,
            fontWeight: 700,
            marginBottom: 8,
          }}
        >
          Paiflow Smart Rules
        </div>
        <div
          style={{
            fontFamily: FONTS.sans,
            fontSize: 14,
            color: "rgba(255, 255, 255, 0.78)",
            lineHeight: 1.45,
          }}
        >
          Zero human intervention. Instant basis-point allocation on Stellar.
        </div>
      </div>

      {/* Node 3: Right 3 Programmable Split Destination Cards */}
      {[
        {
          sp: split1Spring,
          top: 250,
          pct: `${pctNow}%`,
          amt: `₱${amtNow}`,
          tag: "IMMEDIATE ALLOCATION · 7,700 BPS",
          title: "Round Receiver Payout",
          desc: "Sent directly to the scheduled round recipient's wallet or GCash.",
          barColor: "#4ade80",
          badgeBg: "rgba(74, 222, 128, 0.16)",
          fillPct: 77 * countProgress,
        },
        {
          sp: split2Spring,
          top: 490,
          pct: `${pctVault}%`,
          amt: `₱${amtVault}`,
          tag: "COLLATERAL LOCK · 2,000 BPS",
          title: "Ambagan Multisig Vault",
          desc: "Held in 3-of-5 group multisig to guarantee every member finishes the cycle.",
          barColor: "#f472b6",
          badgeBg: "rgba(244, 114, 182, 0.18)",
          fillPct: 20 * countProgress * 3.5,
        },
        {
          sp: split3Spring,
          top: 730,
          pct: `${pctFund}%`,
          amt: `₱${amtFund}`,
          tag: "DEFAULT PROTECTION · 300 BPS",
          title: "Group Safety Fund",
          desc: "Emergency liquidity buffer that covers late payments automatically.",
          barColor: "#fbbf24",
          badgeBg: "rgba(251, 191, 36, 0.18)",
          fillPct: 3 * countProgress * 12,
        },
      ].map((card, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: 1240,
            top: card.top,
            width: 580,
            padding: "22px 28px",
            borderRadius: 26,
            background: "rgba(255, 255, 255, 0.94)",
            color: COLORS.forest,
            boxShadow: "0 24px 55px rgba(0, 0, 0, 0.35)",
            transform: `translateX(${interpolate(card.sp, [0, 1], [80, 0])}px) scale(${card.sp})`,
            opacity: card.sp,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 24,
          }}
        >
          <div style={{ flex: 1 }}>
            <div
              style={{
                display: "inline-block",
                padding: "4px 12px",
                borderRadius: 999,
                background: card.badgeBg,
                color: COLORS.forest,
                fontFamily: FONTS.chivo,
                fontSize: 11.5,
                fontWeight: 700,
                letterSpacing: "0.06em",
                marginBottom: 8,
              }}
            >
              {card.tag}
            </div>
            <div
              style={{
                fontFamily: FONTS.serif,
                fontSize: 26,
                fontWeight: 700,
                marginBottom: 4,
              }}
            >
              {card.title}
            </div>
            <div
              style={{
                fontFamily: FONTS.sans,
                fontSize: 13.5,
                color: COLORS.slate,
                lineHeight: 1.4,
                marginBottom: 10,
              }}
            >
              {card.desc}
            </div>
            {/* Animated Progress Bar */}
            <div
              style={{
                width: "100%",
                height: 7,
                borderRadius: 999,
                background: "rgba(14, 36, 28, 0.08)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, card.fillPct)}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: card.barColor,
                }}
              />
            </div>
          </div>

          <div
            style={{
              textAlign: "right",
              minWidth: 135,
              paddingLeft: 16,
              borderLeft: "1.5px solid rgba(14, 36, 28, 0.1)",
            }}
          >
            <div
              style={{
                fontFamily: FONTS.serif,
                fontSize: 44,
                fontWeight: 700,
                lineHeight: 1,
                color: COLORS.forest,
              }}
            >
              {card.pct}
            </div>
            <div
              style={{
                fontFamily: FONTS.chivo,
                fontSize: 16,
                fontWeight: 700,
                color: COLORS.magenta,
                marginTop: 6,
              }}
            >
              {card.amt}
            </div>
          </div>
        </div>
      ))}
    </AbsoluteFill>
  );
};
