"use client";

import { Box, Typography } from "@mui/material";
import { AnimatePresence, motion } from "framer-motion";
import { CornerDownRight } from "lucide-react";
import { memo, useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import TypingEffect from "../ui/TypingEffect";
import ChatInput from "./ChatInput";
import ModelPicker from "./ModelPicker";
import { DARK_SURFACE } from "../../config/darkMode";

export const FEED_MAX_WIDTH = 1000;

const inputFontSizes = { xs: "1rem", md: "1.1rem" };
const EASE = [0.25, 0.46, 0.45, 0.94];

// The selected model's own entry (by full id, or by name without the
// "agenthub."/"openai." prefix), else the default entry
const entryForModel = (config, selectedModel) => {
  if (!selectedModel) return config.default;
  const shortName = selectedModel.replace(/^[a-z]+\./, "");
  return config.byModel[selectedModel] || config.byModel[shortName] || config.default;
};

// Welcome heading + input box. Before the first message it sits in the middle
// of the main column; once a conversation exists it settles at the bottom.
// The same ChatInput instance is kept in both positions (so typed text and
// attachments survive), and framer-motion's `layout` animates the move.
const ChatComposer = memo(function ChatComposer({
  centered,
  scrollbarGutter = 0,
  welcomeMessage,
  inputRef,
  onSubmit,
  onStop,
  placeholder,
  isLoading = false,
  disabled = false,
  models,
  modelDescriptions,
  selectedModel,
  onModelChange,
  iconTint,
  isDarkBg = false,
}) {
  const textColor = isDarkBg ? "#e5e5e5" : "#000000";
  const [exampleConfig, setExampleConfig] = useState({ byModel: {}, default: [] });
  // Null until loaded, so the generic greeting doesn't flash before an agent's own
  const [welcomeConfig, setWelcomeConfig] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const openPicker = useCallback(() => setPickerOpen(true), []);
  const closePicker = useCallback(() => {
    setPickerOpen(false);
    inputRef?.current?.focus();
  }, [inputRef]);
  const handlePick = useCallback((model) => {
    onModelChange?.(model);
    closePicker();
  }, [onModelChange, closePicker]);

  // Opens below the input on the empty-chat screen and above it once docked at the bottom
  const picker = pickerOpen && (
    <Box sx={centered ? { mt: 1.5 } : { mb: 1.5 }}>
      <ModelPicker
        models={models}
        descriptions={modelDescriptions}
        selectedModel={selectedModel}
        onSelect={handlePick}
        onClose={closePicker}
        isDarkBg={isDarkBg}
      />
    </Box>
  );

  // Suggested prompts and welcome text come from EXAMPLE_QUERIES and
  // WELCOME_MESSAGES in the server env
  useEffect(() => {
    fetch("/api/example-queries")
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data) setExampleConfig({ byModel: data.byModel || {}, default: data.default || [] });
        setWelcomeConfig({ byModel: data?.welcome?.byModel || {}, default: data?.welcome?.default || "" });
      })
      .catch(() => setWelcomeConfig({ byModel: {}, default: "" }));
  }, []);

  const exampleQueries = entryForModel(exampleConfig, selectedModel);
  const customWelcome = welcomeConfig && entryForModel(welcomeConfig, selectedModel);

  return (
    <Box
      sx={{
        flex: centered ? 1 : "0 0 auto",
        display: "flex",
        flexDirection: "column",
        justifyContent: centered ? "center" : "flex-end",
        px: { xs: 2, sm: 3 },
        pb: centered ? "12vh" : 2,
        pt: "12px",
        mr: `${scrollbarGutter}px`,
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
                {customWelcome ? (
                  <motion.div
                    key={selectedModel}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.25, ease: EASE }}
                  >
                    <Box
                      sx={{
                        mb: 2.5,
                        fontSize: { xs: "0.95rem", md: "1.05rem" },
                        lineHeight: 1.5,
                        color: textColor,
                        "& p": { m: 0, mb: 1.5 },
                        "& > :last-child": { mb: 0 },
                      }}
                    >
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{customWelcome}</ReactMarkdown>
                    </Box>
                  </motion.div>
                ) : welcomeConfig && (
                  <>
                    <TypingEffect text="Nice to see you" speed={50}>
                      {(displayedText) => (
                        <Typography sx={{ mb: 1, fontFamily: 'Georgia, "Times New Roman", serif', fontSize: { xs: "1.6rem", md: "2rem" }, fontWeight: 400, lineHeight: 1.3, color: textColor }}>
                          {displayedText}
                        </Typography>
                      )}
                    </TypingEffect>
                    <TypingEffect text={welcomeMessage} speed={50} delay={200}>
                      {(displayedText) => (
                        <Typography sx={{ fontSize: { xs: "1rem", md: "1.1rem" }, fontWeight: 300, lineHeight: 1.3, color: textColor }}>
                          {displayedText}
                        </Typography>
                      )}
                    </TypingEffect>
                  </>
                )}
              </Box>
            </motion.div>
          )}
        </AnimatePresence>

        {!centered && picker}

        <Box
          sx={{
            px: 2.5,
            py: 1.5,
            borderRadius: "10px",
            border: `1px solid ${isDarkBg ? "rgba(255,255,255,0.22)" : "rgba(0, 0, 0, 0.12)"}`,
            backgroundColor: isDarkBg ? DARK_SURFACE : "#ffffff",
            boxShadow: isDarkBg ? "none" : "0 4px 20px rgba(0,0,0,0.06)",
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
            selectedModel={selectedModel}
            onChooseModel={models?.length && onModelChange ? openPicker : undefined}
            accentColor={iconTint}
            isDarkBg={isDarkBg}
          />
        </Box>

        {centered && picker}

        {/* Example queries — clicking one fills the input, it doesn't send */}
        <AnimatePresence initial={false}>
          {centered && !pickerOpen && exampleQueries.length > 0 && (
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
