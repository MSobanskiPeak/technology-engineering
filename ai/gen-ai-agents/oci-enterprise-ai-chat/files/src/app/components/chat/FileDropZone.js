"use client";

import { Box, Typography } from "@mui/material";
import { AnimatePresence, motion } from "framer-motion";
import { Upload } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { TEXT_EXTENSIONS } from "./ChatInput";

const isValidFile = (file) =>
  file.type.startsWith('image/') ||
  file.type.startsWith('text/') ||
  file.type === 'application/pdf' ||
  file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
  file.type === 'application/vnd.ms-excel' ||
  file.name.toLowerCase().endsWith('.pdf') ||
  /\.(xlsx|xls)$/i.test(file.name) ||
  TEXT_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext));

// Wraps an area so files dropped anywhere on it are attached to the chat input.
export default function FileDropZone({ inputRef, isDarkBg = false, sx, children }) {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer?.types?.includes('Files')) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    const files = e.dataTransfer?.files;
    if (files?.length > 0 && inputRef?.current?.addFiles) {
      const validFiles = Array.from(files).filter(isValidFile);
      if (validFiles.length > 0) {
        inputRef.current.addFiles(validFiles);
        inputRef.current.focus();
      }
    }
  }, [inputRef]);

  const muted = isDarkBg ? "rgba(255,255,255," : "rgba(0, 0, 0,";

  return (
    <Box
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      sx={{ position: "relative", ...sx }}
    >
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{
              position: "absolute",
              inset: 16,
              backgroundColor: isDarkBg ? "rgba(36, 36, 36, 0.9)" : "rgba(255, 255, 255, 0.85)",
              border: `2px dashed ${muted} 0.2)`,
              borderRadius: 12,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              zIndex: 100,
              pointerEvents: "none",
            }}
          >
            <Upload size={32} style={{ color: `${muted} 0.3)` }} />
            <Typography sx={{ color: `${muted} 0.5)`, fontWeight: 500 }}>
              Drop files here
            </Typography>
            <Typography sx={{ color: `${muted} 0.35)`, fontSize: "0.8rem" }}>
              Images and text files
            </Typography>
          </motion.div>
        )}
      </AnimatePresence>
      {children}
    </Box>
  );
}
