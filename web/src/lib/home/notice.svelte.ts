/**
 * The one notice for a file the page could not save or open: the first failure sets it, later ones leave it as it was, and
 * Settings shows it. `text` is "" while nothing failed.
 */
export const homeNotice = $state({ text: "" });
