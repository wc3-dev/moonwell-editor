export type TokenRule = { scope?: string | string[]; settings?: { foreground?: string } };

function selectors(scope: TokenRule["scope"]): string[] {
  const list = typeof scope === "string" ? scope.split(",") : (scope ?? []);
  return list.map((each) => each.trim());
}

/** The colour a scope gets, as VS Code picks it: the rule that names most of the scope, the later of two the same. */
export function scopeColor(
  theme: { tokenColors: TokenRule[] },
  scope: string,
  otherwise: string,
): string {
  let color = otherwise;
  let matched = 0;
  for (const rule of theme.tokenColors) {
    const foreground = rule.settings?.foreground;
    if (!foreground) continue;
    for (const selector of selectors(rule.scope)) {
      const named = scope === selector || scope.startsWith(`${selector}.`);
      if (named && selector.length >= matched) {
        color = foreground;
        matched = selector.length;
      }
    }
  }
  return color;
}
