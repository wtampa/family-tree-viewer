// Estimated years widen search links. They stay out of titles.
import { compareHints, computeHints, recordSuggestions } from "./hints.mjs";

function ok(cond, msg) {
  if (!cond) throw new Error(msg);
}

const name = { first: "Ada", surname: "Example" };

export function selftestHintLinks() {
  let n = 0;
  const check = (cond, msg) => { ok(cond, msg); n++; };

  const est = recordSuggestions("Tampa, Florida", { year: 1842, est: true }, name);
  const fs = est.links.find((l) => l.label === "FamilySearch records");
  const anc = est.links.find((l) => l.label === "Ancestry search");
  const fg = est.links.find((l) => l.label === "Find a Grave");
  check(fs?.url.includes("from=1832") && fs.url.includes("to=1852"), "estimated FamilySearch window is ±10");
  check(anc && !anc.url.includes("birth="), "estimated Ancestry link omits a birth year");
  check(fg?.url.includes("birthyearfilter=10"), "estimated Find a Grave filter is 10");

  const exact = recordSuggestions("Tampa, Florida", 1842, name);
  const fsExact = exact.links.find((l) => l.label === "FamilySearch records");
  const ancExact = exact.links.find((l) => l.label === "Ancestry search");
  const fgExact = exact.links.find((l) => l.label === "Find a Grave");
  check(fsExact?.url.includes("from=1839") && fsExact.url.includes("to=1845"), "recorded year stays ±3");
  check(ancExact?.url.includes("birth=1842"), "recorded year is sent to Ancestry");
  check(fgExact?.url.includes("birthyearfilter=5"), "recorded Find a Grave filter stays 5");

  const chron = est.links.find((l) => l.label === "Chronicling America");
  check(chron?.url.includes("date1=1837") && chron.url.includes("date2=1932"), "newspaper window stays wide");

  const pinnedNext = { state: "pinned", priority: 10, title: "B", wall: { nextRecord: "baptism" } };
  const pinned = { state: "pinned", priority: 90, title: "A", wall: null };
  const open = { state: "open", priority: 200, title: "C" };
  const ordered = [open, pinned, pinnedNext].sort(compareHints);
  check(ordered.map((h) => h.title).join(",") === "B,A,C", "pinned next-record sorts first");

  const model = {
    people: {
      I1: {
        id: "I1", name: "Ada Example", first: "Ada", surname: "Example", gender: "F",
        events: [{ id: "E1", role: "Primary" }, { id: "E2", role: "Primary" }, { id: "E3", role: "Primary" }],
        parentFamilies: [], families: [], citations: [], notes: [], names: [{ citations: [] }],
      },
    },
    families: {},
    citations: {},
    sources: {},
    notes: {},
    places: { P1: { id: "P1", title: "Exampleton" } },
    events: {
      E1: { id: "E1", type: "Birth", date: { year: 1840, sort: 18400101, text: "1 Jan 1840" }, place: "P1", citations: [] },
      E2: { id: "E2", type: "Death", date: { year: 1900, sort: 19000202, text: "2 Feb 1900" }, place: "P1", citations: [] },
      E3: { id: "E3", type: "Burial", date: { year: 1899, sort: 18990101, text: "1 Jan 1899" }, place: "P1", citations: [] },
    },
  };
  const hints = computeHints(model, { homeId: "I1" });
  const burial = hints.find((h) => h.id?.endsWith(":burial<death"));
  check(burial?.title === "Burial before death for Ada Example", "burial before death");
  check(!hints.some((h) => h.title.includes("about ")), "estimated years stay out of titles");

  return { tests: n };
}
