"use client";

import { Box, ClickAwayListener, InputBase, Typography } from "@mui/material";
import { Check, Search } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";

const displayName = (model) => model.replace(/^[a-z]+\./, "");

// Filterable list of agents and models, opened from the input's + menu.
// Shown in the page flow next to the input box (not as a popover), as in Agent Hub.
const ModelPicker = memo(function ModelPicker({
  models = [],
  descriptions = {},
  selectedModel,
  onSelect,
  onClose,
  isDarkBg = false,
}) {
  const [filter, setFilter] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef(null);

  const query = filter.trim().toLowerCase();
  const matches = models.filter(m =>
    !query || displayName(m).toLowerCase().includes(query) || (descriptions[m] || "").toLowerCase().includes(query)
  );

  useEffect(() => setActiveIndex(0), [query]);
  useEffect(() => {
    listRef.current?.children[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && matches[activeIndex]) {
      e.preventDefault();
      onSelect(matches[activeIndex]);
    }
  };

  const textColor = isDarkBg ? "rgba(255,255,255,0.9)" : "rgba(0, 0, 0, 0.85)";
  const mutedColor = isDarkBg ? "rgba(255,255,255,0.5)" : "rgba(0, 0, 0, 0.45)";
  const hoverBg = isDarkBg ? "rgba(255,255,255,0.06)" : "rgba(0, 0, 0, 0.04)";

  return (
    <ClickAwayListener onClickAway={onClose}>
      <Box
        onKeyDown={handleKeyDown}
        sx={{
          borderRadius: "14px",
          border: `1px solid ${isDarkBg ? "rgba(255,255,255,0.12)" : "rgba(0, 0, 0, 0.12)"}`,
          backgroundColor: isDarkBg ? "#242424" : "#ffffff",
          boxShadow: isDarkBg ? "0 4px 20px rgba(0,0,0,0.3)" : "0 4px 20px rgba(0,0,0,0.06)",
          overflow: "hidden",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, px: 2, py: 1.25 }}>
          <Search size={18} color={textColor} style={{ flexShrink: 0 }} />
          <InputBase
            autoFocus
            fullWidth
            placeholder="Filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            inputProps={{ "aria-label": "Filter agents and models" }}
            sx={{ fontSize: "0.9rem", color: textColor }}
          />
        </Box>
        <Box ref={listRef} role="listbox" sx={{ maxHeight: 300, overflowY: "auto", pb: 0.5 }}>
          {matches.map((model, i) => (
            <Box
              key={model}
              role="option"
              aria-selected={model === selectedModel}
              onClick={() => onSelect(model)}
              onMouseEnter={() => setActiveIndex(i)}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                px: 2,
                py: 1,
                cursor: "pointer",
                backgroundColor: i === activeIndex ? hoverBg : "transparent",
              }}
            >
              <Typography sx={{ fontSize: "0.9rem", fontWeight: 600, color: textColor, whiteSpace: "nowrap", flexShrink: 0 }}>
                {displayName(model)}
              </Typography>
              {descriptions[model] && (
                <Typography sx={{ fontSize: "0.8rem", color: mutedColor, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                  {descriptions[model]}
                </Typography>
              )}
              {model === selectedModel && <Check size={16} color={textColor} style={{ flexShrink: 0, marginLeft: "auto" }} />}
            </Box>
          ))}
          {matches.length === 0 && (
            <Typography sx={{ px: 2, py: 1, fontSize: "0.85rem", color: mutedColor }}>No matches</Typography>
          )}
        </Box>
      </Box>
    </ClickAwayListener>
  );
});

export default ModelPicker;
