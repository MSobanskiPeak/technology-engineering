"use client";

import { Avatar, Box, Divider, IconButton, ListItemIcon, Menu, MenuItem, Tooltip, Typography } from "@mui/material";
import { History, LogOut, PanelLeftClose, PanelLeftOpen, Plus, Settings } from "lucide-react";
import { memo, useState } from "react";
import { GrOracle } from "react-icons/gr";
import { withBase } from "@/lib/withBase";
import { DARK_BG } from "../../config/darkMode";
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
  showLogo = true,
  user = null,
}) {
  const [userMenuAnchor, setUserMenuAnchor] = useState(null);
  const bgColor = isDarkBg ? DARK_BG : "#fafafa";
  const iconColor = isDarkBg ? "rgba(255,255,255,0.9)" : "rgba(0, 0, 0, 0.55)";
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
    color: isDarkBg ? "rgba(255,255,255,0.95)" : "rgba(0, 0, 0, 0.8)",
    overflow: "hidden",
    textOverflow: "ellipsis",
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
        // In dark mode the bottom-left artwork shows faintly through the sidebar
        backgroundColor: isDarkBg ? "rgba(30, 39, 45, 0.88)" : bgColor,
        backdropFilter: isDarkBg ? "blur(14px)" : undefined,
        borderRight: isDarkBg ? "none" : "1px solid rgba(0, 0, 0, 0.08)",
        transition: "width 0.2s ease",
        overflow: "hidden",
      }}
    >
      {/* Logo + collapse toggle */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: collapsed ? "flex-start" : "space-between", mb: 0.5 }}>
        {!collapsed && (showLogo ? (
          <Box onClick={onNewConversation} sx={{ display: "flex", px: "6px", cursor: "pointer" }}>
            <GrOracle size={30} color={isDarkBg ? "#ffffff" : accentColor} aria-label="New chat" />
          </Box>
        ) : <Box />)}
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

      {navItem(<Plus size={20} style={{ flexShrink: 0 }} />, "New chat", onNewConversation)}

      {/* Conversation history — an icon that expands the sidebar when collapsed */}
      {collapsed ? (
        navItem(<History size={20} style={{ flexShrink: 0 }} />, "Conversation history", onToggleCollapsed)
      ) : (
        <Box sx={{ flex: 1, minHeight: 0, display: "flex", px: "10px", mt: 1 }}>
          <ScrollableList
            title="Chats"
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

      {/* Settings and the signed-in user — pinned to the bottom in both states */}
      <Box sx={{ mt: "auto", pt: 1 }}>
        {onOpenSettings && navItem(<Settings size={20} style={{ flexShrink: 0 }} />, "Settings", onOpenSettings)}
        {user && (
          <>
            {navItem(
              <Avatar sx={{ width: 24, height: 24, fontSize: "0.7rem", flexShrink: 0, bgcolor: isDarkBg ? "rgba(255,255,255,0.15)" : "#1a1a1a", color: isDarkBg ? "#e5e5e5" : "#fff" }}>
                {(user.name || user.email || "U").charAt(0).toUpperCase()}
              </Avatar>,
              user.email || user.name,
              (e) => setUserMenuAnchor(e.currentTarget),
            )}
            <Menu
              anchorEl={userMenuAnchor}
              open={Boolean(userMenuAnchor)}
              onClose={() => setUserMenuAnchor(null)}
              anchorOrigin={{ vertical: "top", horizontal: "left" }}
              transformOrigin={{ vertical: "bottom", horizontal: "left" }}
              PaperProps={{ sx: { minWidth: 200 } }}
            >
              <MenuItem disabled sx={{ opacity: "1 !important", display: "block" }}>
                <Typography sx={{ fontSize: "0.85rem", fontWeight: 500 }}>{user.name}</Typography>
                <Typography sx={{ fontSize: "0.7rem", color: "text.secondary" }}>{user.email}</Typography>
              </MenuItem>
              <Divider />
              <MenuItem
                onClick={() => { window.location.href = withBase("/api/auth/logout"); }}
                sx={{ fontSize: "0.85rem", color: "error.main" }}
              >
                <ListItemIcon sx={{ minWidth: 28 }}>
                  <LogOut size={16} color="#d32f2f" />
                </ListItemIcon>
                Sign out
              </MenuItem>
            </Menu>
          </>
        )}
      </Box>
    </Box>
  );
});

export default ChatSidebar;
