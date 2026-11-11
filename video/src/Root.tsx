import React from "react";
import { Composition } from "remotion";
import { AmbaganMarketingAd } from "./AmbaganMarketingAd";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="AmbaganMarketingAd"
        component={AmbaganMarketingAd}
        durationInFrames={2400}
        fps={60}
        width={1920}
        height={1080}
      />
    </>
  );
};
