/**
 * The strategy vocabulary, shared by the dashboard journal's single-select and the trade detail
 * screen's multi-select so the two halves of the app cannot drift apart.
 *
 * These are stored as plain text — `journal_entries.strategy` and `trades.strategies` — so
 * renaming one here does not rewrite what is already saved. Add to the end rather than editing
 * in place unless you mean to orphan the old name.
 */
export const STRATEGIES = [
  "123",
  "KAR",
  "Adv KAR",
  "ID type A",
  "ID type B",
  "ID type A multi",
  "ID type B multi",
  "ID PP in wick",
  "A.Imb",
  "A.Imb-Fail",
  "D-UW",
];
