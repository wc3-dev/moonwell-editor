// The theme the page showed last (`lastTheme` in state.json, which home.js hands over), put on before anything paints:
// the page's own script runs later and would otherwise leave the first frames in app.css's default colours (Sven,
// 2026-11-03). A plain script, so it blocks the page until it has run.
(() => {
  try {
    const last = JSON.parse(window.moonwellHome?.state ?? "null")?.lastTheme;
    if (!last || typeof last.vars !== "object" || last.vars === null) return;
    const root = document.documentElement;
    for (const [name, color] of Object.entries(last.vars)) {
      if (name.startsWith("--") && typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)) {
        root.style.setProperty(name, color);
      }
    }
    if (last.scheme === "dark" || last.scheme === "light") {
      root.dataset.scheme = last.scheme;
      root.style.colorScheme = last.scheme;
    }
  } catch {
    // No state, or not JSON: the page starts in the default colours.
  }
})();
