"use client";

import { Box, Typography } from "@mui/material";
import { AnimatePresence, motion } from "framer-motion";
import { CornerDownRight } from "lucide-react";
import { memo, useEffect, useState } from "react";
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
  const [exampleQueries, setExampleQueries] = useState([]);

  // Suggested prompts come from EXAMPLE_QUERIES in the server env
  useEffect(() => {
    fetch("/api/example-queries")
      .then(res => (res.ok ? res.json() : { queries: [] }))
      .then(({ queries = [] }) => setExampleQueries(queries))
      .catch(() => { /* suggestions are optional */ });
  }, []);

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
              <Box sx={{ minHeight: { xs: 72, md: 88 } }}>
                <TypingEffect text="Nice to see you" speed={50}>
                  {(displayedText) => (
                    <Typography sx={{ mb: 2, fontSize: { xs: "1.6rem", md: "2rem" }, fontWeight: 300, lineHeight: 1.3, color: textColor }}>
                      {displayedText}
                    </Typography>
                  )}
                </TypingEffect>
                <TypingEffect text={welcomeMessage} speed={50} delay={200}>
                  {(displayedText) => (
                    <Typography sx={{ fontSize: { xs: "1rem", md: "1.2rem" }, fontWeight: 300, lineHeight: 1.3, color: textColor }}>
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

        {/* Example queries — clicking one fills the input, it doesn't send */}
        <AnimatePresence initial={false}>
          {centered && exampleQueries.length > 0 && (
            <motion.div
              key="examples"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: EASE }}
              style={{ overflow: "hidden" }}
            >
              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 0.5, mt: 2, px: 0.5 }}>
                {exampleQueries.map((query) => (
                  <Box
                    key={query}
                    component="button"
                    type="button"
                    onClick={() => inputRef?.current?.setValue?.(query)}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      px: 1,
                      py: 0.5,
                      border: "none",
                      borderRadius: "6px",
                      background: "none",
                      cursor: "pointer",
                      font: "inherit",
                      fontSize: "0.9rem",
                      fontWeight: 500,
                      textAlign: "left",
                      color: isDarkBg ? "rgba(255,255,255,0.85)" : "rgba(0, 0, 0, 0.75)",
                      "&:hover": { backgroundColor: isDarkBg ? "rgba(255,255,255,0.06)" : "rgba(0, 0, 0, 0.04)" },
                    }}
                  >
                    <CornerDownRight size={15} style={{ flexShrink: 0 }} />
                    {query}
                  </Box>
                ))}
              </Box>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </Box>
  );
});

export default ChatComposer;
