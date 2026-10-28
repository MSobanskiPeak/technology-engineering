/**
 * Theme colours for the hand-drawn SVG charts in this folder.
 *
 * They read the dark-mode CSS variables (see config/darkMode.js), so they must be
 * applied as CSS — `el.style.fill = CHART_THEME.muted` or an `sx`/`style` prop —
 * not as SVG attributes (`setAttribute("fill", …)`), which can't read variables.
 * The fallbacks are the original light-theme colours.
 */
export const CHART_THEME = {
  text: "var(--dm-text, #333)",
  muted: "var(--dm-muted, #666)",
  grid: "var(--dm-border, #e0e0e0)",
  // Outline around data points, so they stand out against the background
  pointOutline: "var(--dm-surface, #ffffff)",
  panelBg: "var(--dm-subtle, rgba(0, 0, 0, 0.01))",
  panelBorder: "var(--dm-border, rgba(0, 0, 0, 0.05))",
  // Text on tinted success panels (dark green on light, light green on dark)
  successText: "var(--dm-success-text, #2e7d32)",
};
