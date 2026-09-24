/* Fails (exit 1) when English and Spanish messages don't line up. Run: pnpm i18n:check */
import en from "../messages/en.json";
import es from "../messages/es.json";
import { compareMessages } from "../src/i18n/check";

const problems = compareMessages(es, en);

if (problems.length === 0) {
  console.log("i18n: Spanish and English messages match.");
  process.exit(0);
}

for (const p of problems) {
  if (p.kind === "missing") console.error(`missing in ${p.in}: ${p.key}`);
  else if (p.kind === "empty") console.error(`empty in ${p.in}: ${p.key}`);
  else
    console.error(`placeholders differ at ${p.key}: es {${p.source.join(", ")}} vs en {${p.translation.join(", ")}}`);
}
console.error(`\ni18n: ${problems.length} problem(s). Every Spanish text needs its English version.`);
process.exit(1);
