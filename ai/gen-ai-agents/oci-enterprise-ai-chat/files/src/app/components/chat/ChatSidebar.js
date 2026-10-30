"use client";

import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import { History, PanelLeftClose, PanelLeftOpen, Settings, SquarePen } from "lucide-react";
import { memo } from "react";
import ScrollableList from "../ui/ScrollableList";

export const SIDEBAR_WIDTH = 272;
export const SIDEBAR_COLLAPSED_WIDTH = 64;

// Navigation rail: a full sidebar when expanded, an icon-only rail when
// collapsed. Icons stay clickable in both states.
const ChatSidebar = memo(function ChatSidebar({
  collapsed = false,
  onToggleCollapsed,
  onNewConversation,
  onOpenSettings,
  recentConversations = [],
  loadingConversations = false,
  hasMoreConversations = false,
  isLoadingMoreConversations = false,
  onLoadMoreConversations,
  activeConversationId,
  onConversationClick,
  onConversationDelete,
  onRefreshConversations,
  accentColor = "#C74634",
  isDarkBg = false,
}) {
  const bgColor = isDarkBg ? "#202020" : "#fafafa";
  const iconColor = isDarkBg ? "rgba(255,255,255,0.6)" : "rgba(0, 0, 0, 0.55)";
  const hoverBg = isDarkBg ? "rgba(255,255,255,0.06)" : "rgba(0, 0, 0, 0.04)";

  const navItemSx = {
    display: "flex",
    alignItems: "center",
    gap: 1.5,
    height: 40,
    px: "10px",
    borderRadius: "8px",
    cursor: "pointer",
    color: iconColor,
    whiteSpace: "nowrap",
    overflow: "hidden",
    "&:hover": { backgroundColor: hoverBg },
  };

  const labelSx = {
    fontSize: "0.9rem",
    fontWeight: 400,
    color: isDarkBg ? "rgba(255,255,255,0.85)" : "rgba(0, 0, 0, 0.8)",
    opacity: collapsed ? 0 : 1,
    transition: "opacity 0.15s ease",
  };

  const navItem = (icon, label, onClick) => (
    <Tooltip title={collapsed ? label : ""} placement="right">
      <Box onClick={onClick} sx={navItemSx}>
        {icon}
        <Typography sx={labelSx}>{label}</Typography>
      </Box>
    </Tooltip>
  );

  return (
    <Box
      component="nav"
      sx={{
        width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH,
        flexShrink: 0,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 0.5,
        px: 1.5,
        py: 1.5,
        backgroundColor: bgColor,
        borderRight: `1px solid ${isDarkBg ? "rgba(255,255,255,0.08)" : "rgba(0, 0, 0, 0.08)"}`,
        transition: "width 0.2s ease",
        overflow: "hidden",
      }}
    >
      {/* Collapse toggle */}
      <Box sx={{ display: "flex", justifyContent: collapsed ? "flex-start" : "flex-end", mb: 0.5 }}>
        <Tooltip title={collapsed ? "Expand sidebar" : "Collapse sidebar"} placement="right">
          <IconButton
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            sx={{ color: iconColor, borderRadius: "8px", "&:hover": { backgroundColor: hoverBg } }}
          >
            {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
          </IconButton>
        </Tooltip>
      </Box>

      {navItem(<SquarePen size={20} style={{ flexShrink: 0 }} />, "New conversation", onNewConversation)}

      {/* Conversation history — an icon that expands the sidebar when collapsed */}
      {collapsed ? (
        navItem(<History size={20} style={{ flexShrink: 0 }} />, "Conversation history", onToggleCollapsed)
      ) : (
        <Box sx={{ flex: 1, minHeight: 0, display: "flex", px: "10px", mt: 1 }}>
          <ScrollableList
            title="Conversations"
            titleDelay={0}
            fill
            bgColor={bgColor}
            isDarkBg={isDarkBg}
            accentColor={accentColor}
            items={recentConversations}
            initialLoading={loadingConversations}
            activeId={activeConversationId}
            onItemClick={(item) => {
              if (item && item.id) {
                onConversationClick(item);
              }
            }}
            onItemDelete={onConversationDelete}
            onRefresh={onRefreshConversations}
            hasMore={hasMoreConversations}
            isLoadingMore={isLoadingMoreConversations}
            onLoadMore={onLoadMoreConversations}
          />
        </Box>
      )}

      {/* Settings — pinned to the bottom in both states */}
      {onOpenSettings && (
        <Box sx={{ mt: "auto", pt: 1 }}>
          {navItem(<Settings size={20} style={{ flexShrink: 0 }} />, "Settings", onOpenSettings)}
        </Box>
      )}
    </Box>
  );
});

export default ChatSidebar;
