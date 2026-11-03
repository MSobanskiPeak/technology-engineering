"use client";

import { Avatar, Box, Chip, Divider, IconButton, ListItemIcon, Menu, MenuItem, Skeleton, Tooltip, Typography } from "@mui/material";
import { motion } from "framer-motion";
import { Building2, LogOut, Menu as MenuIcon, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { GrOracle } from "react-icons/gr";
import { withBase } from "@/lib/withBase";

export default function Header({
  onNewConversation,
  isMobile = false,
  onMenuToggle,
  showLabChip = true,
  showLabIcon = true,
  appTitle = "",


  accentColor = "#C74634",
  minimal = false,
  isDarkBg = false,
  appMode,
  onToggleAppMode,
}) {
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [authEnabled, setAuthEnabled] = useState(null); // null until we know
  const [userMenuAnchor, setUserMenuAnchor] = useState(null);
  const [hasAnimated, setHasAnimated] = useState(false);
  useEffect(() => {
    const key = "header-animated";
    if (sessionStorage.getItem(key)) setHasAnimated(true);
    else sessionStorage.setItem(key, "1");
  }, []);

  useEffect(() => {
    fetch('/api/auth/session')
      .then(res => res.json())
      .then(data => {
        setAuthEnabled(data.authEnabled !== false);
        if (data.authenticated) setUser(data.user);
      })
      .catch(() => setAuthEnabled(false))
      .finally(() => setLoadingUser(false));
  }, []);

  return (
    <Box
      sx={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        px: { xs: 1.5, md: 3 },
        py: 1.5,
        zIndex: 100,
        backgroundColor: isDarkBg ? "rgba(26, 26, 26, 0.85)" : "rgba(255, 255, 255, 0.8)",
        backdropFilter: "blur(10px)",
      }}
    >
      {/* Left side: hamburger (mobile) + Title */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        {isMobile && onMenuToggle && (
          <IconButton
            onClick={onMenuToggle}
            sx={{
              color: isDarkBg ? "rgba(255,255,255,0.6)" : "rgba(0, 0, 0, 0.5)",
              p: 1,
              "&:hover": {
                backgroundColor: "rgba(0, 0, 0, 0.04)",
              },
            }}
          >
            <MenuIcon size={22} />
          </IconButton>
        )}
        <motion.div
          initial={hasAnimated ? false : { opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.6,
            delay: 0,
            ease: [0.25, 0.46, 0.45, 0.94],
          }}
        >
          <Box
            onClick={onNewConversation}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              cursor: "pointer",
              "&:hover": {
                opacity: 0.7,
              },
            }}
          >
            {showLabIcon && (
              <GrOracle size={34} color="#e8562f" aria-hidden="true" style={{ display: "block", flexShrink: 0, alignSelf: "center" }} />
            )}
            <Typography
              variant="h1"
              sx={{
                fontSize: { xs: "0.9rem", sm: "1rem", md: "1.1rem" },
                fontWeight: 300,
                color: isDarkBg ? "#e5e5e5" : "#1a1a1a",
                letterSpacing: "0.02em",
                fontFamily: "var(--font-oracle-sans), sans-serif",
                userSelect: "none",
                lineHeight: 1.3,
                // Oracle Sans draws its letters ~0.1em above the centre of the
                // text box, so a centred icon looks low next to the title.
                position: "relative",
                top: "0.15em",
              }}
            >
              {appTitle || (<><Box component="span" sx={{ fontWeight: 600 }}>OCI</Box>{" "}Enterprise AI</>)}
            </Typography>
            {showLabChip && (
              <Chip
                label="BLACK BELTS LAB"
                size="small"
                variant="outlined"
                sx={{
                  display: { xs: "none", md: "flex" },
                  fontSize: "0.55rem",
                  height: 18,
                  borderRadius: "4px",
                  borderColor: "rgba(0, 0, 0, 0.2)",
                  color: isDarkBg ? "rgba(255,255,255,0.6)" : "rgba(0, 0, 0, 0.5)",
                  fontWeight: 500,
                  letterSpacing: "0.1em",
                }}
              />
            )}
          </Box>
        </motion.div>
      </Box>

      {/* Right controls */}
      {!minimal && <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        {/* App Mode toggle — mobile only */}
        {isMobile && appMode && onToggleAppMode && (
          <Tooltip title={appMode === "internal" ? "Internal mode" : "Client mode"} placement="bottom">
            <IconButton
              onClick={onToggleAppMode}
              sx={{
                color: isDarkBg ? "rgba(255,255,255,0.5)" : "rgba(0, 0, 0, 0.4)",
                backgroundColor: "transparent",
                "&:hover": {
                  backgroundColor: isDarkBg ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                  color: isDarkBg ? "rgba(255,255,255,0.7)" : "rgba(0, 0, 0, 0.6)",
                },
              }}
            >
              {appMode === "internal" ? <Building2 size={20} strokeWidth={2} /> : <Users size={20} strokeWidth={2} />}
            </IconButton>
          </Tooltip>
        )}

        {/* User avatar - desktop only. Skeleton only when auth is on. */}
        {!isMobile && loadingUser && authEnabled !== false && (
          <IconButton disabled sx={{ ml: 0.5 }}>
            <Skeleton variant="circular" width={36} height={36} />
          </IconButton>
        )}
        {!isMobile && !loadingUser && user && (
          <>
            <Tooltip title={user.name || user.email} placement="bottom">
              <IconButton
                onClick={(e) => setUserMenuAnchor(e.currentTarget)}
                sx={{ ml: 0.5 }}
              >
                <Avatar
                  sx={{
                    width: 36,
                    height: 36,
                    fontSize: "0.95rem",
                    bgcolor: "#1a1a1a",
                  }}
                >
                  {(user.name || user.email || "U").charAt(0).toUpperCase()}
                </Avatar>
              </IconButton>
            </Tooltip>
            <Menu
              anchorEl={userMenuAnchor}
              open={Boolean(userMenuAnchor)}
              onClose={() => setUserMenuAnchor(null)}
              PaperProps={{ sx: { minWidth: 180 } }}
            >
              <MenuItem disabled sx={{ opacity: "1 !important" }}>
                <Box>
                  <Typography sx={{ fontSize: "0.85rem", fontWeight: 500 }}>
                    {user.name}
                  </Typography>
                  <Typography sx={{ fontSize: "0.7rem", color: "text.secondary" }}>
                    {user.email}
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
      </Box>}
    </Box>
  );
}
