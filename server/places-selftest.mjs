/** Node-only checks: no geocoding, living home events stay off the map. */
import { livingSafeEvent, parseCoord, personStops, resolvePlaceCoord, uniqueMappedPlaces } from "../src/lib/places.js";

function fakeModel({ living, events, places }) {
  return {
    places,
    confidence: { I1: { living } },
    vitals() {
      return { living, all: events };
    },
  };
}

export function selftestPlaces() {
  const places = {
    P1: { id: "P1", title: "Tampa, Florida", name: "Tampa", coord: { lat: 27.95, long: -82.46 }, parents: [] },
    P2: { id: "P2", title: "Example Street, Tampa", name: "Example Street", coord: { lat: 27.96, long: -82.47 }, parents: ["P1"] },
    P3: { id: "P3", title: "Havana, Cuba", name: "Havana", coord: { lat: 23.11, long: -82.36 }, parents: [] },
    P4: { id: "P4", title: "Key West, Florida", name: "Key West", coord: null, parents: ["P1"] },
    P5: { id: "P5", title: "Nowhere", name: "Nowhere", coord: { lat: 0, long: 0 }, parents: [] },
    P6: { id: "P6", title: "Named only", name: "Named only", coord: null, parents: [] },
  };

  if (resolvePlaceCoord(places, "P6")) throw new Error("must not invent coords from a name");
  if (resolvePlaceCoord(places, "P5")) throw new Error("0,0 is not a real coord");
  const inherited = resolvePlaceCoord(places, "P4");
  if (!inherited || inherited.lat !== 27.95 || !inherited.inherited) throw new Error("parent coord walk failed");
  if (parseCoord(places.P1).long !== -82.46) throw new Error("long, not lon");
  if (livingSafeEvent("Residence") || livingSafeEvent("Address") || livingSafeEvent("Census")) {
    throw new Error("living home/census events are not safe to plot");
  }
  if (!livingSafeEvent("Birth") || !livingSafeEvent("Marriage")) throw new Error("birth/marriage should be plottable");

  const living = fakeModel({
    living: true,
    places,
    events: [
      { id: "E1", type: "Birth", place: "P3", date: { year: 1990, sort: 1990 } },
      { id: "E2", type: "Residence", place: "P2", date: { year: 2020, sort: 2020 } },
      { id: "E3", type: "Address", place: "P2", date: { year: 2021, sort: 2021 } },
      { id: "E4", type: "Census", place: "P1", date: { year: 2020, sort: 2020.5 } },
    ],
  });
  const livingStops = personStops(living, "I1");
  if (livingStops.length !== 1 || livingStops[0].placeId !== "P3") {
    throw new Error(`living home events leaked: ${JSON.stringify(livingStops)}`);
  }

  const dead = fakeModel({
    living: false,
    places,
    events: [
      { id: "E1", type: "Birth", place: "P3", date: { year: 1880, sort: 1880 } },
      { id: "E2", type: "Residence", place: "P6", date: { year: 1890, sort: 1890 } },
      { id: "E3", type: "Death", place: "P4", date: { year: 1910, sort: 1910 } },
    ],
  });
  const deadStops = personStops(dead, "I1");
  if (deadStops.length !== 3) throw new Error("deceased path should keep named places");
  if (deadStops[1].lat != null) throw new Error("named-only place must stay unmapped");
  if (deadStops[2].lat !== 27.95) throw new Error("death should inherit parent coord");
  if (uniqueMappedPlaces(deadStops).length !== 2) throw new Error("mapped unique count");

  return { ok: true, tests: 8 };
}
