import { handleSearchEntity } from "../lib/voice/handlers/search.ts";

for (const q of [
  "go to rel 01 page",
  "first release",
  "open Billing Hotfix",
  "v2.14.0",
]) {
  const r = await handleSearchEntity({ query: q });
  console.log(
    JSON.stringify(
      {
        q,
        actionLine: r.actionLine,
        matchCount: r.matchCount,
        single: r.single
          ? { path: r.single.path, label: r.single.label }
          : null,
        top: (r.candidates ?? []).slice(0, 2).map((c) => ({
          path: c.path,
          label: c.label,
        })),
      },
      null,
      2
    )
  );
}
