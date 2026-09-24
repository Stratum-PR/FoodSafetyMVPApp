/**
 * Compares the Spanish source messages with a translation and lists what's wrong:
 * keys missing in either file, empty strings, and {placeholders} that don't match.
 * Used by scripts/check-i18n.ts (CI) and the unit tests.
 */
type Messages = { [key: string]: string | Messages };

export type I18nProblem =
  | { kind: "missing"; key: string; in: string }
  | { kind: "empty"; key: string; in: string }
  | { kind: "placeholders"; key: string; source: string[]; translation: string[] };

function flatten(messages: Messages, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(path, value);
    else flatten(value, path).forEach((v, k) => out.set(k, v));
  }
  return out;
}

// An argument is "{name}" or "{name, plural, …}". Plural branches like "one {# día}" are text, not arguments.
const placeholders = (text: string) => [...new Set([...text.matchAll(/\{\s*(\w+)\s*[,}]/g)].map((m) => m[1]))].sort();

export function compareMessages(
  source: Messages,
  translation: Messages,
  names = { source: "es", translation: "en" },
): I18nProblem[] {
  const a = flatten(source);
  const b = flatten(translation);
  const problems: I18nProblem[] = [];

  for (const [key, text] of a) {
    if (!b.has(key)) problems.push({ kind: "missing", key, in: names.translation });
    if (!text.trim()) problems.push({ kind: "empty", key, in: names.source });
  }
  for (const [key, text] of b) {
    if (!a.has(key)) problems.push({ kind: "missing", key, in: names.source });
    if (!text.trim()) problems.push({ kind: "empty", key, in: names.translation });
    const s = a.get(key);
    if (s !== undefined && placeholders(s).join() !== placeholders(text).join()) {
      problems.push({ kind: "placeholders", key, source: placeholders(s), translation: placeholders(text) });
    }
  }
  return problems;
}
