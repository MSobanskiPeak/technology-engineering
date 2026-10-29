"use client";

import { Box, Typography } from "@mui/material";
import { AnimatePresence, motion } from "framer-motion";
import { memo } from "react";
import TypingEffect from "../ui/TypingEffect";
import ChatInput from "./ChatInput";

export const FEED_MAX_WIDTH = 800;

const inputFontSizes = { xs: "1rem", md: "1.1rem" };
const EASE = [0.25, 0.46, 0.45, 0.94];

// Welcome heading + input box. Before the first message it sits in the middle
// of the main column; once a conversation exists it settles at the bottom.
// The same ChatInput instance is kept in both positions (so typed text and
// attachments survive), and framer-motion's `layout` animates the move.
const ChatComposer = memo(function ChatComposer({
  centered,
  welcomeMessage,
  inputRef,
  onSubmit,
  onStop,
  placeholder,
  isLoading = false,
  disabled = false,
  models,
  selectedModel,
  onModelChange,
  iconTint,
  isDarkBg = false,
}) {
  const textColor = isDarkBg ? "#e5e5e5" : "#000000";

  return (
    <Box
      sx={{
        flex: centered ? 1 : "0 0 auto",
        display: "flex",
        flexDirection: "column",
        justifyContent: centered ? "center" : "flex-end",
        px: { xs: 2, sm: 3 },
        pb: centered ? "12vh" : 2,
      }}
    >
      <motion.div
        layout="position"
        transition={{ duration: 0.45, ease: EASE }}
        style={{ width: "100%", maxWidth: FEED_MAX_WIDTH, margin: "0 auto" }}
      >
        <AnimatePresence initial={false}>
          {centered && (
            <motion.div
              key="welcome"
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: EASE }}
              style={{ overflow: "hidden" }}
            >
              <Box sx={{ mb: 3, minHeight: { xs: 72, md: 88 } }}>
                <TypingEffect text="Hey," speed={50}>
                  {(displayedText) => (
                    <Typography sx={{ fontSize: { xs: "1.6rem", md: "2rem" }, fontWeight: 300, lineHeight: 1.3, color: textColor }}>
                      {displayedText}
                    </Typography>
                  )}
                </TypingEffect>
                <TypingEffect text={welcomeMessage} speed={50} delay={200}>
                  {(displayedText) => (
                    <Typography sx={{ fontSize: { xs: "1.6rem", md: "2rem" }, fontWeight: 300, lineHeight: 1.3, color: textColor }}>
                      {displayedText}
                    </Typography>
                  )}
                </TypingEffect>
              </Box>
            </motion.div>
          )}
        </AnimatePresence>

        <Box
          sx={{
            px: 2.5,
            py: 1.5,
            borderRadius: "14px",
            border: `1px solid ${isDarkBg ? "rgba(255,255,255,0.12)" : "rgba(0, 0, 0, 0.12)"}`,
            backgroundColor: isDarkBg ? "#242424" : "#ffffff",
            boxShadow: isDarkBg ? "0 4px 20px rgba(0,0,0,0.3)" : "0 4px 20px rgba(0,0,0,0.06)",
          }}
        >
          <ChatInput
            ref={inputRef}
            compact
            onSubmit={onSubmit}
            onStop={onStop}
            placeholder={placeholder}
            fontSize={inputFontSizes}
            disabled={disabled}
            isLoading={isLoading}
            models={models}
            selectedModel={selectedModel}
            onModelChange={onModelChange}
            accentColor={iconTint}
            isDarkBg={isDarkBg}
          />
        </Box>
      </motion.div>
    </Box>
  );
});

export default ChatComposer;
