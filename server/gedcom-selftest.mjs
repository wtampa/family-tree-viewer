// Ancestry-shaped GEDCOM: BOM, UTF-16, CONC/CONT, pointer NOTE/OBJE, QUAY, slashless NAME.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodeGedcom, loadGedcom, parseGedcom } from "./gedcom-parse.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.resolve(here, "..", "sample", "fixtures");

function ok(cond, msg) {
  if (!cond) throw new Error(msg);
}

function assertShape(model, label, check) {
  const people = Object.keys(model.people);
  check(people.length === 5, `${label}: 5 people, got ${people.length}`);
  const ada = model.people.I1;
  check(ada?.first === "Ada" && ada.surname === "Example", `${label}: Ada Example`);
  const bram = model.people.I2;
  check(bram?.first === "Bram" && bram.surname === "Story", `${label}: slashless name`);
  check(ada.notes.length === 1, `${label}: pointer note attached`);
  const note = model.notes[ada.notes[0]]?.text || "";
  check(note.includes("continues on the same line"), `${label}: CONC kept`);
  check(note.includes("second line about the parish"), `${label}: CONT kept`);
  check(ada.media.length === 1, `${label}: pointer media attached`);
  const media = model.media[ada.media[0].id];
  check(media?.src === "portraits/ada-example.jpg", `${label}: OBJE FILE`);
  check(/portrait/i.test(media?.description || ""), `${label}: OBJE TITL`);
  const birth = model.events[ada.events[0].id];
  check(birth?.type === "Birth" && birth.citations.length === 1, `${label}: birth citation`);
  check(model.citations[birth.citations[0]]?.confidence === 3, `${label}: QUAY 3`);
  check(model.citations[birth.citations[0]]?.page === "12", `${label}: birth page`);
  const fam = model.families.F1;
  const marr = fam.events.map((e) => model.events[e.id]).find((e) => e.type === "Marriage");
  check(marr?.citations.length === 1, `${label}: marriage citation`);
  check(model.citations[marr.citations[0]]?.confidence === 1, `${label}: QUAY 1`);
  check(model.sources.S1?.title === "Registro Civil de Exampleton", `${label}: source title`);
  check(!people.some((id) => model.people[id].name.includes("_APID")), `${label}: _APID is not a person`);
}

export function selftestGedcom() {
  let n = 0;
  const check = (cond, msg) => { ok(cond, msg); n++; };

  const utf8Path = path.join(fixtures, "ancestry-style.ged");
  const utf16Path = path.join(fixtures, "ancestry-style-utf16.ged");
  const utf8 = fs.readFileSync(utf8Path);
  check(utf8[0] === 0xef && utf8[1] === 0xbb && utf8[2] === 0xbf, "utf-8 fixture starts with a BOM");
  const utf16 = fs.readFileSync(utf16Path);
  check(utf16[0] === 0xff && utf16[1] === 0xfe, "utf-16 fixture starts with a BOM");

  const fromUtf8 = loadGedcom(utf8Path);
  const fromUtf16 = loadGedcom(utf16Path);
  assertShape(fromUtf8, "utf-8", check);
  assertShape(fromUtf16, "utf-16", check);

  const ansel = Buffer.concat([
    Buffer.from("0 HEAD\n1 CHAR ANSEL\n0 @I1@ INDI\n1 NAME Jos", "latin1"),
    Buffer.from([0xe9]),
    Buffer.from(" /Example/\n1 SEX M\n0 TRLR\n", "latin1"),
  ]);
  let invalid = false;
  try { new TextDecoder("utf-8", { fatal: true }).decode(ansel); } catch { invalid = true; }
  check(invalid, "ANSEL fixture is not valid UTF-8");
  const anselModel = parseGedcom(decodeGedcom(ansel));
  check(anselModel.people.I1?.first === "José", "ANSEL byte becomes José");

  const validUtf8AnselHeader = Buffer.from("0 HEAD\n1 CHAR ANSEL\n0 @I1@ INDI\n1 NAME Ada /Example/\n1 SEX F\n0 TRLR\n", "utf8");
  const kept = parseGedcom(decodeGedcom(validUtf8AnselHeader));
  check(kept.people.I1?.first === "Ada", "valid UTF-8 is not recoded");

  return { tests: n };
}
