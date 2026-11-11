import { loadFont as loadPlayfair } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadChivo } from "@remotion/google-fonts/Chivo";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

const playfair = loadPlayfair();
const chivo = loadChivo();
const inter = loadInter();

export const FONTS = {
  serif: `${playfair.fontFamily}, Georgia, serif`,
  chivo: `${chivo.fontFamily}, system-ui, sans-serif`,
  sans: `${inter.fontFamily}, system-ui, -apple-system, sans-serif`,
};

export const COLORS = {
  limeTop: "#e1eda0",
  limeMid: "#eef5c8",
  cream: "#f8faf0",
  white: "#ffffff",
  forest: "#0e241c",
  forestMid: "#17422f",
  emerald: "#1f6e46",
  emeraldBright: "#35a167",
  magenta: "#b54880",
  magentaLight: "#f4d7e6",
  magentaGlow: "rgba(181, 72, 128, 0.35)",
  amber: "#d97706",
  slate: "#51635b",
  glassBg: "rgba(255, 255, 255, 0.84)",
  glassBorder: "rgba(14, 36, 28, 0.12)",
  darkGlassBg: "rgba(14, 36, 28, 0.90)",
  darkGlassBorder: "rgba(225, 237, 160, 0.25)",
};
