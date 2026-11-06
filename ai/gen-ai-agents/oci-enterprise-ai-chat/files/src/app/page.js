"use client";

import {
  Alert,
  Avatar,
  Box,
  Chip,
  Divider,
  Drawer,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  Skeleton,
  Snackbar,
  Typography,
  useMediaQuery,
  useTheme,
  ThemeProvider,
  createTheme,
} from "@mui/material";
import { LogOut, Settings, SquarePen, Building2, Users } from "lucide-react";
import { withBase } from "@/lib/withBase";
import { useBaseRouter as useRouter } from "@/lib/useBaseRouter";
import { useEffect, useState, useCallback, useMemo } from "react";
import Header from "./components/ui/Header";
import ChatMessage from "./components/chat/ChatMessage";
import ChatSidebar from "./components/chat/ChatSidebar";
import ChatComposer, { FEED_MAX_WIDTH } from "./components/chat/ChatComposer";
import { TablePageContext, getTablePages } from "./utils/tablePaging";
import FileDropZone from "./components/chat/FileDropZone";
import ScrollableList from "./components/ui/ScrollableList";
import OracleLogo from "./components/ui/OracleLogo";
import AgentHubBackground from "./components/ui/AgentHubBackground";
import useChat from "./hooks/useChat";
import { darkModeOverrides, darkCssVars, lightCssVars, DARK_BG, DARK_SURFACE } from "./config/darkMode";
import { INTERNAL_MODELS } from "./config/models-internal";

const INTERNAL_MODE_AVAILABLE = INTERNAL_MODELS.length > 0;

const contentFontSizes = { xs: "1.2rem", sm: "1.4rem", md: "1.6rem" };

function mixWithWhite(hex, amount) {
  const c = (hex || "#000000").replace("#", "");
  const r = Math.min(255, Math.round(parseInt(c.substring(0, 2), 16) + (255 - parseInt(c.substring(0, 2), 16)) * amount));
  const g = Math.min(255, Math.round(parseInt(c.substring(2, 4), 16) + (255 - parseInt(c.substring(2, 4), 16)) * amount));
  const b = Math.min(255, Math.round(parseInt(c.substring(4, 6), 16) + (255 - parseInt(c.substring(4, 6), 16)) * amount));
  return `#${r.toString(16).padStart(2,"0")}${g.toString(16).padStart(2,"0")}${b.toString(16).padStart(2,"0")}`;
}

export default function Home({ initialConversationId = null }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const router = useRouter();

  // UI Settings from localStorage
  const [uiSettings, setUiSettings] = useState({
    appTitle: "Oracle AIDP",
    appLogo: "",
    welcomeMessage: "Welcome back!",
    inputPlaceholder: "Type anything...",
  });

  const accentColor = uiSettings.accentColor || "#C74634";
  const hasCustomAccent = !!uiSettings.accentColor && uiSettings.accentColor.toLowerCase() !== "#c74634";
  const iconTint = hasCustomAccent ? accentColor : null;
  const isDarkBg = uiSettings.darkMode !== false;
  const accentForDark = (() => {
    if (!isDarkBg) return accentColor;
    const c = (accentColor || "#C74634").replace("#", "");
    const lum = (parseInt(c.substring(0,2),16)*0.299 + parseInt(c.substring(2,4),16)*0.587 + parseInt(c.substring(4,6),16)*0.114) / 255;
    return lum < 0.3 ? mixWithWhite(accentColor, 0.15) : accentColor;
  })();
  const darkTheme = isDarkBg ? createTheme({
    ...theme,
    palette: {
      ...theme.palette,
      mode: "dark",
      background: { default: DARK_BG, paper: DARK_SURFACE },
      text: { primary: "#e5e5e5", secondary: "rgba(255,255,255,0.5)" },
      divider: "rgba(255,255,255,0.08)",
    },
  }) : theme;

  const [showTextField, setShowTextField] = useState(false);
  const [appMode, setAppMode] = useState("client"); // 'client' or 'internal'
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [sessionUser, setSessionUser] = useState(null);
  const [drawerUserMenuAnchor, setDrawerUserMenuAnchor] = useState(null);

  // Desktop sidebar collapsed state, remembered per browser
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    try {
      setSidebarCollapsed(localStorage.getItem("sidebarCollapsed") === "true");
    } catch { /* storage unavailable */ }
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => {
      try { localStorage.setItem("sidebarCollapsed", String(!prev)); } catch { /* storage unavailable */ }
      return !prev;
    });
  }, []);

  useEffect(() => {
    router.prefetch?.("/settings");
  }, [router]);

  // Error snackbar state
  const [errorSnackbar, setErrorSnackbar] = useState({
    open: false,
    message: "",
  });

  // Model selection
  const [selectedModel, setSelectedModel] = useState("");
  const [models, setModels] = useState([]);
  const [modelDescriptions, setModelDescriptions] = useState({});

  const handleError = (message) => {
    setErrorSnackbar({ open: true, message });
  };

  // Use the chat hook
  const {
    isLoading,
    isLoadingConversation,
    chatHistory,
    activeChips,
    copiedId,
    spacerHeight,
    recentConversations,
    loadingConversations,
    hasMoreConversations,
    isLoadingMoreConversations,
    loadMoreConversations,
    genaiService,
    latestMessageRef,
    chatContainerRef,
    inputRef,
    handleSubmit,
    handleRetry,
    handleApprovalSubmit,
    stopGeneration,
    handleWidgetSubmit,
    handleOptionSelect,
    handleChipChange,
    handleCopy,
    handleNewConversation,
    handleConversationClick,
    handleConversationDelete,
    getExchangeCopyContent,
    refreshRecentConversations,
  } = useChat({
    initialConversationId,
    selectedModel,
    onError: handleError,
  });

  // Drives the layout: centred composer on an empty chat, feed + docked composer otherwise
  const hasConversation = chatHistory.length > 0 || isLoadingConversation;
  const tablePages = useMemo(() => getTablePages(chatHistory), [chatHistory]);

  // Width of the feed's scrollbar gutter. The composer leaves the same space on
  // its right so the input lines up with the feed.
  const [scrollbarGutter, setScrollbarGutter] = useState(0);
  useEffect(() => {
    const feed = chatContainerRef.current;
    if (!feed) return;
    const observer = new ResizeObserver(() => setScrollbarGutter(feed.offsetWidth - feed.clientWidth));
    observer.observe(feed);
    return () => observer.disconnect();
  }, [chatContainerRef]);

  const handleCloseSnackbar = (_event, reason) => {
    if (reason === "clickaway") return;
    setErrorSnackbar({ ...errorSnackbar, open: false });
  };

  const handleModelChange = (model) => {
    setSelectedModel(model);
    localStorage.setItem("selectedModel", model);
  };

  const handleToggleAppMode = () => {
    const newMode = appMode === "internal" ? "client" : "internal";
    setAppMode(newMode);
    localStorage.setItem("appMode", newMode);
    // Notify ChatInput to update tool badge/menu
    window.dispatchEvent(new Event('mcp-tools-changed'));
    // If switching to client mode and current model is excluded, reset to default
    if (newMode === "client") {
      const isInternalOpenAI = selectedModel.startsWith("openai.") && !selectedModel.replace(/^[a-z]+\./, "").startsWith("gpt-oss");
      const isXai = selectedModel.startsWith("xai.");
      if (isInternalOpenAI || isXai) {
        const defaultModel = "google.gemini-2.5-pro";
        setSelectedModel(defaultModel);
        localStorage.setItem("selectedModel", defaultModel);
      }
    }
  };

  // Filter models based on app mode. When internal mode is unavailable, no
  // filtering is needed because the model list already excludes internal entries.
  const filteredModels = !INTERNAL_MODE_AVAILABLE
    ? models
    : appMode === "client"
      ? models.filter(m => {
          if (m.startsWith("xai.")) return false;
          if (m.startsWith("openai.") && !m.replace(/^[a-z]+\./, "").startsWith("gpt-oss")) return false;
          return true;
        })
      : models;

  // Wrap conversation click to also close drawer on mobile
  const handleConversationClickMobile = useCallback((item) => {
    if (item && item.id) {
      handleConversationClick(item);
      setMobileDrawerOpen(false);
    }
  }, [handleConversationClick]);

  useEffect(() => {
    // Load UI settings from localStorage
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("uiSettings");
      if (stored) {
        try {
          const parsedSettings = JSON.parse(stored);
          setUiSettings(parsedSettings);
          document.title = parsedSettings.appTitle || "Oracle AIDP";
        } catch (e) {
          console.error("Error parsing UI settings:", e);
        }
      }
    }

    const handleUiSettingsChanged = (e) => {
      setUiSettings(e.detail);
      document.title = e.detail.appTitle || "Oracle AIDP";
    };
    window.addEventListener('uiSettingsChanged', handleUiSettingsChanged);

    // Load app mode
    const savedMode = localStorage.getItem("appMode");
    if (savedMode === "client" || savedMode === "internal") {
      setAppMode(savedMode);
    }

    const STATIC_MODELS = [
      // OpenAI - External & Internal
      // "openai.gpt-oss-20b",
      // "openai.gpt-oss-120b",
      // // Google
      // "google.gemini-2.5-flash",
      // "google.gemini-2.5-flash-lite",
      // "google.gemini-2.5-pro",
      // xAI
      "xai.grok-4.7",
      // "xai.grok-4.6",
      // "cohere.command-a-03-2025",
      // "meta.llama-3.3-70b-instruct",
      // Internal-only entries (empty array on the public branch)
      ...INTERNAL_MODELS,
    ];

    setModels(STATIC_MODELS);

    // Load saved model preference, but validate against available models.
    // Stale entries (e.g. an internal model saved before stripping) fall back to default.
    const savedModel = localStorage.getItem("selectedModel");
    const savedIsAvailable = savedModel && STATIC_MODELS.includes(savedModel);
    if (savedIsAvailable) {
      setSelectedModel(savedModel);
    } else if (STATIC_MODELS.length > 0) {
      const defaultModel = "xai.grok-4.7";
      setSelectedModel(defaultModel);
      localStorage.setItem("selectedModel", defaultModel);
    }

    // Agent Hub agents (A2A) are configured server-side via AGENT_HUB_AGENTS and
    // appended as "agenthub.<name>" entries. A saved agent selection is restored
    // once the list arrives (the check above ran before it was known).
    fetch('/api/a2a')
      .then(res => (res.ok ? res.json() : { agents: [] }))
      .then(({ agents = [] }) => {
        const agentIds = agents.map(a => a.id);
        if (agentIds.length === 0) return;
        setModels(prev => [...prev, ...agentIds.filter(id => !prev.includes(id))]);
        setModelDescriptions(Object.fromEntries(agents.filter(a => a.description).map(a => [a.id, a.description])));
        if (agentIds.includes(savedModel)) {
          setSelectedModel(savedModel);
          localStorage.setItem("selectedModel", savedModel);
        }
      })
      .catch(() => { /* Agent Hub is optional */ });

    // Fetch user for mobile drawer
    fetch('/api/auth/session')
      .then(res => res.json())
      .then(data => {
        if (data.authenticated) setSessionUser(data.user);
      })
      .catch(() => {});

    // Show text field after welcome animation completes
    const timer = setTimeout(() => {
      setShowTextField(true);
    }, 200);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('uiSettingsChanged', handleUiSettingsChanged);
    };
  }, []);

  return (
    <ThemeProvider theme={darkTheme}>
    <Box
      sx={{
        height: "100vh",
        width: "100%",
        backgroundColor: isDarkBg ? DARK_BG : "#ffffff",
        display: "flex",
        flexDirection: "column",
        ...(isDarkBg ? { ...darkCssVars, ...darkModeOverrides } : lightCssVars),
      }}
    >
      {showTextField && <AgentHubBackground isDarkBg={isDarkBg} />}

      {/* Header — mobile only; on desktop the sidebar holds the logo and user */}
      {isMobile && (
        <Header
          onNewConversation={handleNewConversation}
          isMobile={isMobile}
          onMenuToggle={() => setMobileDrawerOpen(true)}
          showLabChip={uiSettings.showLabChip !== false}
          showLabIcon={uiSettings.showLabIcon !== false}
          appTitle={uiSettings.appTitle}
          accentColor={accentForDark}
          isDarkBg={isDarkBg}
          appMode={INTERNAL_MODE_AVAILABLE ? appMode : undefined}
          onToggleAppMode={INTERNAL_MODE_AVAILABLE ? handleToggleAppMode : undefined}
        />
      )}

      {/* Mobile Drawer */}
      {isMobile && (
        <Drawer
          anchor="left"
          open={mobileDrawerOpen}
          onClose={() => setMobileDrawerOpen(false)}
          PaperProps={{
            sx: {
              width: 280,
              pt: 3,
              px: 2,
              display: "flex",
              flexDirection: "column",
              backgroundColor: isDarkBg ? DARK_BG : "#ffffff",
              color: isDarkBg ? "#e5e5e5" : "inherit",
              ...(isDarkBg ? { ...darkCssVars, ...darkModeOverrides } : {}),
            },
          }}
        >
          {/* Logo */}
          <Box sx={{ mb: 2, ml: "-20px" }}>
            {uiSettings.appLogo ? (
              <img
                src={uiSettings.appLogo}
                alt="App Logo"
                style={{
                  maxHeight: "40px",
                  width: "auto",
                  objectFit: "contain",
                  ...(isDarkBg && { filter: "brightness(0) invert(1)", opacity: 0.85 }),
                }}
              />
            ) : (
              <OracleLogo accentColor={accentForDark} isDarkBg={isDarkBg} maxHeight={100} />
            )}
          </Box>

          {/* New conversation */}
          <Box
            onClick={() => {
              setMobileDrawerOpen(false);
              handleNewConversation();
            }}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              px: 1,
              py: 1,
              mb: 1,
              cursor: "pointer",
              borderRadius: 1,
              "&:hover": { backgroundColor: isDarkBg ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.04)" },
            }}
          >
            <SquarePen size={18} style={{ color: isDarkBg ? "rgba(255,255,255,0.5)" : "rgba(0, 0, 0, 0.4)" }} />
            <Typography sx={{ fontSize: "0.85rem", color: isDarkBg ? "rgba(255,255,255,0.7)" : "rgba(0, 0, 0, 0.6)", fontWeight: 400 }}>
              New conversation
            </Typography>
          </Box>

          {/* Recent conversations */}
          <Box sx={{ flex: 1, overflow: "hidden" }}>
            <ScrollableList
              title="Recent conversations"
              items={recentConversations}
              activeId={genaiService?.getConversationId()}
              onItemClick={handleConversationClickMobile}
              onItemDelete={handleConversationDelete}
              onRefresh={refreshRecentConversations}
              titleDelay={0}
            />
          </Box>

          {/* Bottom section: settings + user */}
          <Box sx={{ pb: 3 }}>
            <Divider sx={{ mb: 1.5, borderColor: isDarkBg ? "rgba(255,255,255,0.08)" : undefined }} />

            {/* Settings row */}
            <Box
              onClick={() => {
                setMobileDrawerOpen(false);
                router.push("/settings");
              }}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                px: 1,
                py: 1,
                cursor: "pointer",
                borderRadius: 1,
                "&:hover": { backgroundColor: isDarkBg ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.04)" },
              }}
            >
              <Settings size={18} style={{ color: isDarkBg ? "rgba(255,255,255,0.5)" : "rgba(0, 0, 0, 0.4)" }} />
              <Typography sx={{ fontSize: "0.85rem", color: isDarkBg ? "rgba(255,255,255,0.7)" : "rgba(0, 0, 0, 0.6)", fontWeight: 400 }}>
                Settings
              </Typography>
            </Box>

            {/* User row */}
            {sessionUser && (
              <>
                <Box
                  onClick={(e) => setDrawerUserMenuAnchor(e.currentTarget)}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    px: 1,
                    py: 1,
                    mt: 0.5,
                    cursor: "pointer",
                    borderRadius: 1,
                    "&:hover": { backgroundColor: isDarkBg ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.04)" },
                  }}
                >
                  <Avatar
                    sx={{
                      width: 24,
                      height: 24,
                      fontSize: "0.7rem",
                      bgcolor: isDarkBg ? "rgba(255,255,255,0.15)" : "#1a1a1a",
                      color: isDarkBg ? "#e5e5e5" : "#fff",
                    }}
                  >
                    {(sessionUser.name || sessionUser.email || "U").charAt(0).toUpperCase()}
                  </Avatar>
                  <Typography sx={{ fontSize: "0.85rem", color: isDarkBg ? "rgba(255,255,255,0.7)" : "rgba(0, 0, 0, 0.6)", fontWeight: 400, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {sessionUser.name || sessionUser.email}
                  </Typography>
                </Box>
                <Menu
                  anchorEl={drawerUserMenuAnchor}
                  open={Boolean(drawerUserMenuAnchor)}
                  onClose={() => setDrawerUserMenuAnchor(null)}
                  PaperProps={{ sx: { minWidth: 180 } }}
                >
                  <MenuItem disabled sx={{ opacity: "1 !important" }}>
                    <Box>
                      <Typography sx={{ fontSize: "0.85rem", fontWeight: 500 }}>
                        {sessionUser.name}
                      </Typography>
                      <Typography sx={{ fontSize: "0.7rem", color: "text.secondary" }}>
                        {sessionUser.email}
                      </Typography>
                      <Chip
                        label="Oracle IDCS"
                        size="small"
                        sx={{
                          mt: 0.75,
                          fontSize: "0.6rem",
                          height: 18,
                          borderRadius: "4px",
                          bgcolor: "rgba(200, 50, 50, 0.08)",
                          color: "#c83232",
                          fontWeight: 600,
                          letterSpacing: "0.03em",
                        }}
                      />
                    </Box>
                  </MenuItem>
                  <Divider />
                  <MenuItem
                    onClick={() => { window.location.href = withBase('/api/auth/logout'); }}
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
        </Drawer>
      )}

      {/* Main container: sidebar + main column */}
      <Box
        sx={{
          display: "flex",
          width: "100%",
          paddingTop: isMobile ? "60px" : 0,
          height: "100vh",
          boxSizing: "border-box",
          position: "relative",
          zIndex: 2,
        }}
      >
        {/* Collapsible sidebar (desktop only — mobile uses the drawer) */}
        {!isMobile && (
          <ChatSidebar
            collapsed={sidebarCollapsed}
            onToggleCollapsed={toggleSidebar}
            onNewConversation={handleNewConversation}
            onOpenSettings={() => router.push("/settings")}
            recentConversations={recentConversations}
            loadingConversations={loadingConversations}
            hasMoreConversations={hasMoreConversations}
            isLoadingMoreConversations={isLoadingMoreConversations}
            onLoadMoreConversations={loadMoreConversations}
            activeConversationId={genaiService?.getConversationId()}
            onConversationClick={handleConversationClick}
            onConversationDelete={handleConversationDelete}
            onRefreshConversations={refreshRecentConversations}
            accentColor={accentForDark}
            isDarkBg={isDarkBg}
            showLogo={uiSettings.showLabIcon !== false}
            user={sessionUser}
          />
        )}

        {/* Main column: message feed + composer */}
        <FileDropZone
          inputRef={inputRef}
          isDarkBg={isDarkBg}
          sx={{
            flex: 1,
            minWidth: 0,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            color: isDarkBg ? "#e5e5e5" : "inherit",
          }}
        >
          {/* Message feed — empty (and collapsed) until the first message */}
          <Box
            ref={chatContainerRef}
            sx={{
              flex: hasConversation ? 1 : "0 0 0px",
              minHeight: 0,
              overflowY: "auto",
              overflowX: "hidden",
              // Keeps the width steady as the scrollbar appears
              scrollbarGutter: "stable",
              position: "relative",
            }}
          >
            <Box sx={{
              // Content width, like the composer: the padding sits outside it
              boxSizing: "content-box",
              maxWidth: FEED_MAX_WIDTH,
              mx: "auto",
              px: { xs: 2, sm: 3 },
              pt: 3,
            }}>
              {/* Skeleton loading while conversation loads */}
              {isLoadingConversation && chatHistory.length === 0 && (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 3, pt: 2 }}>
                  {[0, 1, 2].map((i) => {
                    const bubbleBg = isDarkBg ? "rgba(255,255,255,0.08)" : "rgba(0, 0, 0, 0.06)";
                    const lineBg = isDarkBg ? "rgba(255,255,255,0.05)" : "rgba(0, 0, 0, 0.04)";
                    return (
                      <Box key={i} sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                        {/* User message skeleton (right) */}
                        <Skeleton
                          variant="rounded"
                          width={i === 0 ? "45%" : i === 1 ? "30%" : "40%"}
                          height={40}
                          sx={{ borderRadius: "16px", bgcolor: bubbleBg, alignSelf: "flex-end" }}
                        />
                        {/* Assistant message skeleton (left) */}
                        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.8 }}>
                          <Skeleton variant="text" width="90%" sx={{ fontSize: "1rem", bgcolor: lineBg }} />
                          <Skeleton variant="text" width="75%" sx={{ fontSize: "1rem", bgcolor: lineBg }} />
                          <Skeleton variant="text" width={i === 1 ? "40%" : "60%"} sx={{ fontSize: "1rem", bgcolor: lineBg }} />
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              )}

              {chatHistory.map((exchange, exchangeIndex) => (
                <TablePageContext.Provider key={exchange.id} value={tablePages[exchangeIndex]}>
                  <ChatMessage
                    exchange={exchange}
                    exchangeIndex={exchangeIndex}
                    latestMessageRef={latestMessageRef}
                    contentFontSizes={contentFontSizes}
                    activeChips={activeChips}
                    onChipChange={handleChipChange}
                    copiedId={copiedId}
                    onCopy={handleCopy}
                    getCopyContent={getExchangeCopyContent}
                    onWidgetSubmit={handleWidgetSubmit}
                    onOptionSelect={handleOptionSelect}
                    onRetry={handleRetry}
                    onApprovalSubmit={handleApprovalSubmit}
                    isLoading={isLoading}
                  />
                </TablePageContext.Provider>
              ))}

              {/* Dynamic spacer to allow scrolling latest message to top */}
              {chatHistory.length > 0 && spacerHeight > 0 && (
                <Box sx={{ height: spacerHeight }} />
              )}
            </Box>
          </Box>

          {/* Composer — centred on an empty chat, docked at the bottom after */}
          {showTextField && (
            <ChatComposer
              centered={!hasConversation}
              scrollbarGutter={scrollbarGutter}
              welcomeMessage={uiSettings.welcomeMessage}
              inputRef={inputRef}
              onSubmit={handleSubmit}
              onStop={stopGeneration}
              placeholder={uiSettings.inputPlaceholder}
              isLoading={isLoading}
              disabled={isLoading || isLoadingConversation}
              models={filteredModels}
              modelDescriptions={modelDescriptions}
              selectedModel={selectedModel}
              onModelChange={handleModelChange}
              iconTint={iconTint}
              isDarkBg={isDarkBg}
            />
          )}
        </FileDropZone>
      </Box>

      {/* Error Snackbar */}
      <Snackbar
        open={errorSnackbar.open}
        autoHideDuration={8000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={handleCloseSnackbar}
          severity="error"
          variant="filled"
          sx={{
            width: "100%",
            fontSize: "1rem",
            "& .MuiAlert-icon": {
              fontSize: "1.5rem",
            },
          }}
        >
          {errorSnackbar.message}
        </Alert>
      </Snackbar>

      {/* App Mode FAB — desktop only (mobile uses header toggle) */}
      {INTERNAL_MODE_AVAILABLE && !isMobile && <Box
        onClick={handleToggleAppMode}
        sx={{
          position: "fixed",
          bottom: 24,
          right: 24,
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 2,
          py: 1,
          borderRadius: 10,
          cursor: "pointer",
          zIndex: 1200,
          backgroundColor: isDarkBg ? "rgba(255,255,255,0.08)" : "rgba(255, 255, 255, 0.9)",
          border: `1px solid ${isDarkBg ? "rgba(255,255,255,0.10)" : "rgba(0, 0, 0, 0.12)"}`,
          backdropFilter: "blur(12px)",
          boxShadow: isDarkBg ? "0 2px 12px rgba(0,0,0,0.3)" : "0 2px 12px rgba(0,0,0,0.08)",
          transition: "all 0.3s ease",
          "&:hover": {
            transform: "translateY(-2px)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
          },
          "&:active": {
            transform: "translateY(0)",
          },
        }}
      >
        {appMode === "internal" ? (
          <Building2 size={16} color={isDarkBg ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.6)"} strokeWidth={2.2} />
        ) : (
          <Users size={16} color={isDarkBg ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.6)"} strokeWidth={2.2} />
        )}
        <Typography sx={{
          fontSize: "0.75rem",
          fontWeight: 600,
          color: isDarkBg ? "rgba(255,255,255,0.8)" : "rgba(0, 0, 0, 0.7)",
          letterSpacing: "0.02em",
          userSelect: "none",
        }}>
          {appMode === "internal" ? "Internal" : "Client"}
        </Typography>
      </Box>}
    </Box>
    </ThemeProvider>
  );
}
