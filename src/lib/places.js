/**
 * Place stops and map points from the tree file.
 * Uses only Gramps/GEDCOM coordinates already on `places` (or a parent place).
 * Never geocodes. Never invents a lat/long from a name.
 */

const LIVING_SAFE = /birth|baptism|christen|marriage|divorce|annul|engagement|immigrat|emigrat|naturaliz|military|ordin|graduat|educat|confirm|communion|bar mitzvah|bat mitzvah/i;

export function livingSafeEvent(type) {
  return LIVING_SAFE.test(String(type || ""));
}

export function parseCoord(place) {
  if (!place?.coord) return null;
  const lat = Number(place.coord.lat);
  const long = Number(place.coord.long ?? place.coord.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(long)) return null;
  if (lat === 0 && long === 0) return null;
  if (Math.abs(lat) > 90 || Math.abs(long) > 180) return null;
  return { lat, long };
}

/** Walk the Gramps place hierarchy for a stored coord. Does not look up names. */
export function resolvePlaceCoord(places, placeId) {
  let cur = places?.[placeId];
  const start = placeId;
  let guard = 0;
  while (cur && guard++ < 12) {
    const c = parseCoord(cur);
    if (c) {
      return {
        ...c,
        placeId: cur.id,
        title: cur.title || cur.name || "",
        inherited: cur.id !== start,
      };
    }
    const next = cur.parents?.[0];
    if (!next) break;
    cur = places[next];
  }
  return null;
}

export function personStops(model, pid) {
  if (!model || !pid) return [];
  const v = model.vitals(pid);
  const living = Boolean(v.living || model.confidence?.[pid]?.living);
  const out = [];
  for (const ev of v.all || []) {
    if (!ev?.place) continue;
    if (living && !livingSafeEvent(ev.type)) continue;
    const pl = model.places?.[ev.place];
    const title = pl?.title || pl?.name || "";
    if (!title) continue;
    const coord = resolvePlaceCoord(model.places, ev.place);
    out.push({
      personId: pid,
      eventId: ev.id,
      type: ev.type,
      year: ev.date?.year ?? null,
      sort: ev.date?.sort ?? 9e9,
      placeId: ev.place,
      title,
      short: title.split(",")[0].trim() || title,
      lat: coord?.lat ?? null,
      long: coord?.long ?? null,
      inherited: Boolean(coord?.inherited),
    });
  }
  out.sort((a, b) => a.sort - b.sort || (a.year ?? 9e9) - (b.year ?? 9e9));
  return out;
}

export function uniqueMappedPlaces(stops) {
  const map = new Map();
  for (const s of stops || []) {
    if (s.lat == null || s.long == null) continue;
    const key = `${s.lat.toFixed(5)},${s.long.toFixed(5)}`;
    let row = map.get(key);
    if (!row) {
      row = {
        lat: s.lat,
        long: s.long,
        title: s.title,
        short: s.short,
        people: new Set(),
        count: 0,
        year: s.year,
      };
      map.set(key, row);
    }
    if (s.personId) row.people.add(s.personId);
    row.count++;
    if (s.year != null && (row.year == null || s.year < row.year)) row.year = s.year;
  }
  return [...map.values()].map((r) => ({ ...r, people: [...r.people] }));
}

export function mappedLine(stops) {
  const line = [];
  for (const s of stops || []) {
    if (s.lat == null || s.long == null) continue;
    const last = line[line.length - 1];
    if (last && last.lat === s.lat && last.long === s.long) continue;
    line.push(s);
  }
  return line;
}

export function eventDotColor(type) {
  if (/Birth|Baptism|Christen/i.test(type || "")) return "#8bff9a";
  if (/Death|Burial|Cremation/i.test(type || "")) return "#ff5f6d";
  if (/Marriage/i.test(type || "")) return "#ffd34d";
  return "#cbd5e1";
}
