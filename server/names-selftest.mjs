/** Node-only checks: aliases only — never rewrite the stored display name. */
import {
  fold,
  compact,
  surnameUnits,
  surnameCores,
  visibleAliases,
  identityKeys,
  namesLikelySame,
  scoreNameQuery,
  matchedAlias,
  packPerson,
} from "../src/lib/names.js";

function person(partial) {
  const first = partial.first || "";
  const surname = partial.surname || "";
  const names = partial.names || [{
    type: "Birth Name",
    alt: false,
    first,
    surname,
    surnames: partial.surnames || (surname ? [{ value: surname, prefix: partial.prefix || "", connector: "", prim: true }] : []),
    nick: partial.nick || "",
    call: "",
    suffix: "",
  }];
  return {
    id: partial.id || "I1",
    name: partial.name || [first, surname].filter(Boolean).join(" "),
    first,
    surname,
    suffix: "",
    names,
  };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function selftestNames() {
  let n = 0;
  const ok = (cond, msg) => { n += 1; assert(cond, msg); };

  ok(fold("García") === "garcia", "accent fold");
  ok(fold("de la Torre") === "de la torre", "particle fold");
  ok(compact("de la Torre") === "delatorre", "compact particle");

  const units = surnameUnits("de la Torre y García");
  ok(units.length === 2 && units[0] === "de la Torre" && units[1] === "García", `units: ${JSON.stringify(units)}`);
  ok(surnameUnits("García-López").join("|") === "García|López", "hyphen splits");
  ok(surnameUnits("Delgado")[0] === "Delgado", "do not strip inside Delgado");

  const torre = person({ first: "María", surname: "de la Torre", prefix: "de la", surnames: [{ value: "Torre", prefix: "de la", connector: "", prim: true }] });
  ok(torre.name === "María de la Torre", "display stays Gramps");
  ok(surnameCores(torre).includes("torre"), "core strips de la");
  ok(scoreNameQuery("torre", torre) > 0, "search Torre");
  ok(scoreNameQuery("dela torre", torre) > 0, "search dela torre");
  ok(scoreNameQuery("delatorre", torre) > 0, "search delatorre");
  ok(scoreNameQuery("garcia", torre) === 0, "unrelated surname misses");
  ok(visibleAliases(torre).some((a) => /torre/i.test(a) && !/^de la /i.test(a)), "visible stripped particle");
  ok(!visibleAliases(torre).includes(torre.name), "visible list does not repeat display");

  const two = person({ first: "Juan", surname: "García López" });
  ok(scoreNameQuery("lopez garcia", two) > 0, "apellido order swap");
  ok(scoreNameQuery("García López", two) > 0, "accented query");
  ok(scoreNameQuery("juan garcia-lopez", two) > 0, "hyphen query");
  ok(visibleAliases(two).some((a) => /López García|Lopez Garcia/i.test(a)), "visible order swap");

  const hyphen = person({ first: "Juan", surname: "García-López" });
  ok(namesLikelySame(two, hyphen), "hyphen vs space are the same person");
  ok(namesLikelySame(person({ first: "Juan", surname: "de la Torre" }), person({ first: "Juan", surname: "Torre" })), "particle vs stripped");
  ok(namesLikelySame(person({ first: "María", surname: "García López" }), person({ first: "Maria", surname: "Lopez Garcia" })), "accent + order");
  ok(!namesLikelySame(person({ first: "Juan", surname: "García" }), person({ first: "Juan", surname: "García López" })), "one vs two surnames stay distinct");

  const keys = identityKeys(person({ first: "Juan", surname: "de la Torre" }));
  ok(keys.some((k) => k.startsWith("torre|")), `identity uses core: ${keys}`);

  const packed = packPerson(torre);
  ok(packed.aliases.includes("maria de la torre"), "alias indexes folded display");
  ok(packed.compactAliases.includes("delatorre"), "compact indexed");
  ok(!packed.firsts.includes("pedro"), "does not invent a given name");

  ok(!matchedAlias(torre, "torre"), "no via when the printed name already contains the query");
  ok(!matchedAlias(torre, "maria de la torre"), "no via when query is the printed name");
  ok(matchedAlias(torre, "delatorre"), "via when the compact particle form is typed");
  ok(matchedAlias(two, "lopez garcia"), "via on apellido swap");

  return { ok: true, tests: n };
}
