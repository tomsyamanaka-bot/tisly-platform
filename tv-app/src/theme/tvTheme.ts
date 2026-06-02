/** Google TV 10-foot UI — 遠目視認用 */
export const tvTheme = {
  colors: {
    background: "#0d1117",
    card: "#161b22",
    border: "#30363d",
    text: "#e6edf3",
    muted: "#8b949e",
    primary: "#1a7f37",
    alarm: "#da3633",
    warning: "#d29922",
  },
  fontSize: {
    hero: 56,
    title: 36,
    body: 24,
    caption: 18,
  },
  spacing: {
    card: 24,
    screen: 48,
  },
  card: {
    minHeight: 160,
    borderRadius: 16,
    padding: 28,
  },
  nav: {
    dark: true,
    colors: {
      primary: "#1a7f37",
      background: "#0d1117",
      card: "#161b22",
      text: "#e6edf3",
      border: "#30363d",
      notification: "#da3633",
    },
    fonts: {
      regular: { fontFamily: "System", fontWeight: "400" as const },
      medium: { fontFamily: "System", fontWeight: "500" as const },
      bold: { fontFamily: "System", fontWeight: "700" as const },
      heavy: { fontFamily: "System", fontWeight: "800" as const },
    },
  },
};
