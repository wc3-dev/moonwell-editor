/**
 * The notice for a file the page could not save or open, shown in Settings. It is the latest failure not put right yet:
 * a later failure shows over it, and a write (or open) of that file that goes through takes its failure away, so an
 * earlier one still failing shows again (the agent's call, 2026-11-24). `text` is "" while nothing is failing.
 */
export const homeNotice = $state({ text: "" });

// The failures not put right yet, by what failed (`write:settings.json`, `open:themes`), the latest last.
const failures = new Map<string, string>();

function show(): void {
  homeNotice.text = [...failures.values()].at(-1) ?? "";
}

/** Says that `what` failed, with the text to show. */
export function failed(what: string, text: string): void {
  failures.delete(what);
  failures.set(what, text);
  show();
}

/** Says that `what` went through: its failure, if any, is put right. */
export function succeeded(what: string): void {
  if (failures.delete(what)) show();
}

/** Forgets every failure (for tests). */
export function clearHomeNotice(): void {
  failures.clear();
  homeNotice.text = "";
}
