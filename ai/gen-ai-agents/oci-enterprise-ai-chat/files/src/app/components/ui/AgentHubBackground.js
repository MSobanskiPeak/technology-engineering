"use client";

import { Box } from "@mui/material";
import { withBase } from "@/lib/withBase";

const layerSx = { position: "fixed", pointerEvents: "none", userSelect: "none", zIndex: 0 };

// How far each curve slides out towards its corner once a chat has started,
// as a share of the image's own size
const SPREAD = "20%";
const spreadSx = { transition: "transform 0.9s cubic-bezier(0.22, 1, 0.36, 1)", willChange: "transform" };

// Agent Hub artwork: film grain over the whole page, with the curves in the
// top-right and bottom-left corners. Sits behind the sidebar and the feed.
// When `spread` is set (a query has been sent), the curves move diagonally
// further into their corners.
export default function AgentHubBackground({ isDarkBg = false, spread = false }) {
  return (
    <Box aria-hidden="true">
      {/* The grain lightens the page, so the base under it is a touch below DARK_BG */}
      <Box sx={{ ...layerSx, inset: 0, backgroundColor: isDarkBg ? "#1A2429" : undefined }}>
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            backgroundImage: `url(${withBase("/OracleBackgroundNoise.png")})`,
            backgroundSize: "600px",
            opacity: isDarkBg ? 0.035 : 0.15,
          }}
        />
      </Box>
      <Box
        component="img"
        src={withBase("/OracleBottomLeft.png")}
        alt=""
        sx={{ ...layerSx, ...spreadSx, filter: "blur(1.5px)", display: { xs: "none", md: "block" }, left: 0, bottom: 0, width: 405, height: "auto", transform: spread ? `translate(-${SPREAD}, ${SPREAD})` : "none" }}
      />
      <Box
        component="img"
        src={withBase("/OracleTopRight.png")}
        alt=""
        sx={{ ...layerSx, ...spreadSx, filter: "blur(1.5px)", top: 0, right: 0, height: { xs: "40vh", md: "70vh" }, width: "auto", transform: spread ? `translate(${SPREAD}, -${SPREAD})` : "none" }}
      />
    </Box>
  );
}
