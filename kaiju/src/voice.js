// The words: one line for every rules event, and the newspaper headline at the end.
// LINES holds the templates, one table per event kind (most split by variant). A variant may have
// a sharper table for one attack or one unit type, keyed "variant.id"; it is used when present,
// and a building (a populated structure) falls back to the plain structure lines.
// VARS turns an event's data into the placeholders. The pick is lines[(turn * 7 + n) % length],
// never the game's dice, so changing a line never changes a replay.
// Placeholders: {Name} the acting kaiju, {Target} the kaiju struck, {part} a part, {is}/{takes}
// agree with the part, {unit} a unit noun, {aUnit} with its article, {thing} a unit or structure
// noun, {aThing} with its article, {ground} the terrain struck, {weapon} a unit's weapon.

import { KAIJU } from "./data/kaiju.js";
import { STRUCTURES, TERRAIN } from "./data/terrain.js";
import { UNITS } from "./data/units.js";
import { DIR_NAMES, distance } from "./hex.js";

// How the log names each unit type.
export const NOUNS = {
  infantry: "Guard squad",
  tank: "tank",
  artillery: "artillery battery",
  helicopter: "attack helicopter",
  jet: "jet",
  missile: "missile battery",
  gun: "gun emplacement",
  maser: "maser cannon",
  scientist: "mad scientist",
};

export const LINES = {
  refuse: ["{why}"],
  phase: {
    kaiju: [
      "Turn {turn}. The monster has the initiative.",
      "Turn {turn}. Barometer falling.",
      "Turn {turn}. The sirens have not stopped.",
      "Turn {turn}. Wind from the south, and something in it.",
    ],
    defense: ["The army answers.", "Control gives its orders.", "The defense forces take their turn.", "The guns have their turn."],
  },
  move: {
    walk: [
      "{Name} comes on, {walked}. {cost} AP.",
      "{Name} moves {walked}. Traffic is diverted. {cost} AP.",
      "{Name} advances {walked}. {cost} AP.",
      "{Name} crosses {walked}, unhurried. {cost} AP.",
    ],
    step: ["{Name} takes one step. {cost} AP.", "{Name} shifts one hex. The ground notices. {cost} AP.", "One step from {Name}. {cost} AP."],
    teleport: [
      "{Name} steps through an angle that is not there and stands {hexes} off.",
      "{Name} is elsewhere, {hexes} off. Witnesses disagree on how.",
      "The air folds. {Name} is {hexes} away.",
    ],
  },
  face: ["{Name} turns {dir}.", "{Name} faces {dir}.", "{Name} looks {dir}."],
  crush: {
    unit: [
      "{ATHING} was in the way. It is now part of the {ground}.",
      "{Name} steps on {aThing}.",
      "{ATHING} goes under {Name}'s foot.",
      "{Name} walks over {aThing}. It does not come up.",
    ],
    structure: [
      "{Name} walks through the {thing}.",
      "The {thing} was in the way, and then it was not.",
      "{Name} goes through the {thing} as a storm goes through a fence.",
      "{Name} wades into the {thing}. Brick, glass, dust.",
    ],
    power: ["{Name} walks into the {thing}. The wires go taut, then slack.", "{Name} steps on the {thing}."],
  },
  attack: {
    kaijuHitsUnit: [
      "{Attack}. The {thing} takes {damage}.",
      "{Name}'s {attack} catches the {thing}. {damage} damage.",
      "{Attack} on the {thing}: {damage}.",
      "{Name} finds the {thing}. {Attack}, {damage} damage.",
    ],
    "kaijuHitsUnit.breath": [
      "Atomic breath. The {thing} is briefly the brightest thing in the state. {damage} damage.",
      "Atomic breath across the {ground}. The {thing} takes {damage}.",
    ],
    "kaijuHitsUnit.surge": ["The sea comes in over the {ground}. The {thing} takes {damage}.", "Tidal surge. The {thing} is under water, then under {damage} damage."],
    "kaijuHitsUnit.stomp": ["{Name} stamps on the {thing}. {damage} damage.", "Stomp. The {thing} takes {damage}."],
    "kaijuHitsUnit.finish": ["Final formation. The {thing} takes {damage}. It was not the intended audience."],
    kaijuMissesUnit: ["{Attack} misses the {thing}.", "{Attack}. The {thing} is not where it was.", "{Attack} goes wide of the {thing}."],
    kaijuHitsStructure: ["{Attack} into the {thing}. {damage} damage.", "{Attack}. The {thing} takes {damage}.", "{Name} sets about the {thing}. {Attack}, {damage} damage."],
    kaijuHitsBuilding: [
      "{Attack} into the {thing}. {damage} damage.",
      "{Attack}. The {thing} takes {damage}.",
      "{Attack} on the {thing}. Plaster falls. {damage} damage.",
    ],
    "kaijuHitsBuilding.breath": ["Atomic breath. Every window in the {thing} goes at once. {damage} damage.", "Atomic breath. The {thing} glows, then smokes. {damage} damage."],
    "kaijuHitsStructure.breath": ["Atomic breath. The {thing} glows, then smokes. {damage} damage.", "Atomic breath across the {thing}. {damage} damage."],
    "kaijuHitsStructure.surge": ["The sea goes through the {thing}. {damage} damage.", "Tidal surge. The {thing} takes {damage} and a great deal of water."],
    "kaijuHitsStructure.stomp": ["{Name} stamps on the {thing}. {damage} damage.", "Stomp. The {thing} takes {damage}."],
    kaijuHitsKaiju: [
      "{Attack} lands on {Target}'s {part}. {damage} damage{rear}.",
      "{Attack}. {Target} takes {damage} on the {part}{rear}.",
      "{Name} reaches {Target}. {Attack}, {damage} on the {part}{rear}.",
    ],
    "kaijuHitsKaiju.breath": ["Atomic breath full on {Target}. {damage} on the {part}{rear}.", "Atomic breath. {Target}'s {part} {takes} {damage}{rear}."],
    "kaijuHitsKaiju.finish": ["Final formation. Five machines become one blow. {Target} takes {damage} on the {part}{rear}."],
    "kaijuHitsKaiju.grab": ["Tentacles find {Target}'s {part}. {damage} damage{rear}.", "Tentacle grab. {Target}'s {part} is held, and hurt. {damage} damage{rear}."],
    kaijuMissesKaiju: ["{Attack} misses {Target}.", "{Target} sways clear of the {attack}.", "{Attack}. {Target} is not there to receive it."],
    gaze: ["{Name} looks at the {thing}.", "The {thing} meets {Name}'s gaze.", "{Name}'s gaze rests on the {thing}."],
    unitHitsKaiju: [
      "The {unit} fires. {damage} on {Target}'s {part}{rear}.",
      "The {unit} hits {Target}'s {part}. {damage} damage{rear}.",
      "{Weapon} from the {unit}. {Target}'s {part} takes {damage}{rear}.",
    ],
    "unitHitsKaiju.maser": [
      "The maser cannon fires. The air smells of hot tin. {damage} on {Target}'s {part}{rear}.",
      "Maser beam. {Target}'s {part} takes {damage}{rear}.",
    ],
    "unitHitsKaiju.scientist": [
      "The mad scientist's ray touches {Target}'s {part}. {damage} damage{rear}, and something slower.",
      "A thin green ray from the mad scientist. {Target}'s {part}, {damage}{rear}. It lingers.",
    ],
    "unitHitsKaiju.gun": ["The gun emplacement fires. {damage} on {Target}'s {part}{rear}.", "Fire from the wall. {Target}'s {part} takes {damage}{rear}."],
    "unitHitsKaiju.jet": ["The jet comes in low. {damage} on {Target}'s {part}{rear}.", "Missiles from the jet. {Target}'s {part} takes {damage}{rear}."],
    unitMissesKaiju: ["The {unit} fires at {Target} and misses.", "The {unit} fires its {weapon}. A miss.", "The {unit} misses. {Target} does not notice."],
  },
  destroyed: {
    unit: ["The {thing} is destroyed.", "One {thing} fewer.", "The {thing} is out of the war.", "Scratch one {thing}."],
    structure: ["The {thing} comes down.", "The {thing} is rubble.", "Where the {thing} stood there is dust.", "The {thing} folds into the street."],
    kaiju: ["{Name} falls and does not get up.", "{Name} goes down. The ground shakes for some time.", "{Name} is down. The weather is clearing."],
  },
  blast: {
    damage: [
      "The {thing} goes up with {Name} inside it. {damage} on the {part}.",
      "The {thing} explodes under {Name}. {damage} on the {part}.",
      "A flash, then the sound. The {thing} is gone and {Name} takes {damage} on the {part}.",
    ],
    energy: ["The {thing} goes up. {Name} drinks the fire.", "The {thing} explodes. {Name} seems to enjoy it.", "The {thing} burns. {Name} stands in it and grows warm."],
  },
  panic: {
    broke: [
      "The {unit} recalls urgent business elsewhere.",
      "The {unit} breaks and runs.",
      "The {unit} leaves. It does not say where.",
      "The {unit} falls back without orders.",
    ],
    held: ["The {unit} holds.", "The {unit} stays. Nobody asks how.", "The {unit} does not run. Not yet."],
  },
  eat: {
    unit: [
      "{Name} eats the {thing}. Hunger {hunger}.",
      "{Name} has {aThing} for lunch. Hunger {hunger}.",
      "{Name} eats. The {thing} is not seen again. Hunger {hunger}.",
    ],
    structure: [
      "{Name} eats the {thing}, occupants and all. Hunger {hunger}.",
      "{Name} bites the top off the {thing}. Hunger {hunger}.",
      "{Name} feeds on the {thing}. Nobody comes out. Hunger {hunger}.",
    ],
    power: ["{Name} eats the {thing}, wires and all.", "{Name} chews through the {thing}. Sparks, then quiet."],
  },
  energy: {
    gain: ["{Why} feeds {Name}. Energy {energy}, up {change}.", "{Name} gains {change} energy from {why}. Energy {energy}.", "{Name}: energy {energy}, up {change}, from {why}."],
    drain: ["{Name}'s battery runs down. Energy {energy}.", "{Name} draws on its battery. Energy {energy}.", "{Name}: battery at {energy}."],
    loss: ["{Name} loses {change} energy to {why}. Energy {energy}."],
  },
  hunger: {
    normal: ["{Name}: hunger {hunger} of {max}.", "{Name} is hungry. Hunger {hunger} of {max}.", "{Name} has not eaten lately. Hunger {hunger} of {max}."],
    high: [
      "{Name} is very hungry. Hunger {hunger} of {max}.",
      "{Name} has started looking at people. Hunger {hunger} of {max}.",
      "Hunger {hunger} of {max}. {Name} is thinking about lunch.",
    ],
  },
  part: {
    intact: ["{Name}'s {part} {is} whole again.", "{Name}'s {part} {has} knitted."],
    hurt: ["{Name}'s {part} {is} hurt.", "{Name}'s {part} {takes} a dent.", "{Name}'s {part} {shows} the damage."],
    bad: ["{Name}'s {part} {is} badly hurt.", "{Name}'s {part} {is} in poor shape.", "{Name}'s {part} {is} close to giving out."],
    crippled: ["{Name}'s {part} {is} crippled.", "{Name}'s {part} {stops} working.", "{Name}'s {part} {is} finished."],
  },
  heal: ["{Name}'s {part} {heals} to {hp} of {max}.", "{Name} mends. The {part}: {hp} of {max}.", "{Name}'s {part} {closes}. {hp} of {max}."],
  roar: [
    "{Name} roars. Everything within {radius} hexes hears it.",
    "{Name} roars. Windows go first, for {radius} hexes.",
    "{Name} roars. Car alarms answer for {radius} hexes.",
  ],
  berserk: ["{Name} is too hungry to take orders. It goes looking for food.", "{Name} stops listening. It is lunchtime.", "Hunger has {Name} now. It goes where the food is."],
  reinforce: ["{AUNIT} arrives.", "Reinforcements: {aUnit}.", "{AUNIT} joins the defense."],
  umove: {
    one: ["The {unit} moves one hex.", "The {unit} shifts position.", "The {unit} edges over."],
    many: ["The {unit} moves {walked}.", "The {unit} repositions, {walked}.", "The {unit} changes ground, {walked}."],
    pulled: ["{Name} drags the {unit} in.", "The {unit} is pulled closer by something it would rather not describe."],
  },
  withdraw: ["{Name} leaves the map.", "{Name} walks away. Nobody follows.", "{Name} goes back where it came from. For now."],
  radio: {
    arrive: ["{CALLSIGN} TO CONTROL. ON STATION.", "{CALLSIGN} ARRIVING. VISUAL ON THE TARGET.", "{CALLSIGN} CHECKING IN. AWAITING TARGET."],
    break: [
      "{CALLSIGN} TO CONTROL. WE ARE FALLING BACK.",
      "{CALLSIGN} TO CONTROL. REQUEST PERMISSION TO BE ELSEWHERE.",
      "{CALLSIGN}. CANNOT HOLD. CANNOT HOLD.",
      "CONTROL, {CALLSIGN}. IT LOOKED AT US.",
    ],
    fire: [
      "{CALLSIGN}. ENGAGING.",
      "{CALLSIGN} TO CONTROL. TARGET HAS TURNED. REQUEST INSTRUCTIONS.",
      "{CALLSIGN} TO CONTROL. FIRING FOR EFFECT.",
      "{CALLSIGN}. TARGET IN SIGHT. IT IS VERY LARGE.",
    ],
  },
  over: {
    goal: ["The objective is met. {grade}. Score {total}.", "It is done. {grade}. Score {total}.", "The job is finished. {grade}. Score {total}."],
    time: ["Time is up. {grade}. Score {total}.", "The clock has run out. {grade}. Score {total}.", "Dawn. Nothing is settled. {grade}. Score {total}."],
    withdrawn: ["The monster has withdrawn. {grade}. Score {total}.", "The monster is gone. {grade}. Score {total}."],
    fallen: ["The monster has fallen. {grade}. Score {total}.", "The monster is down. {grade}. Score {total}.", "Silence where the monster was. {grade}. Score {total}."],
  },
};

// Headlines by grade: newspaper caps, a semicolon, a quoted official. Each grade has lines fitted
// to a mission, and lines for any other. {TARGET} is the objective, {NAME} the player's kaiju,
// {NOUN} what the papers call it, {PLACE} the town. "-driven": the rival withdrew.
export const HEADLINES = {
  "total victory": {
    any: ["{TARGET} GONE; GENERAL 'REVIEWING OPTIONS'", "{NOUN} TAKES {TARGET}, WALKS AWAY; OFFICIALS 'DEEPLY CONCERNED'"],
    fortress: [
      "{NAME} OVER THE WALL; GENERAL 'REVIEWING OPTIONS'",
      "KESSEL BUNKER FLATTENED; ARMY 'WE NEVER SAID SAFE'",
      "BUNKER GONE, {NOUN} UNMARKED; COLONEL 'WE HIT IT, WE ARE SURE'",
    ],
    swathe: [
      "{TARGET} LOST, {NOUN} UNHURT; MAYOR 'WE WILL REBUILD'",
      "{PLACE} CUT IN TWO; POLICE 'STAY INDOORS'",
      "{NOUN} TAKES {TARGET}, WALKS BACK TO SEA; MAYOR 'DEEPLY CONCERNED'",
    ],
    coast: ["{TARGET} BEATEN ON THE BEACH; FISHERMEN 'WE SAW IT ALL'", "{NAME} KEEPS {PLACE}; COASTGUARD 'ONE MONSTER IS PLENTY'"],
  },
  victory: {
    any: ["{TARGET} FALLS; GENERAL 'IT WAS LIMPING'", "{TARGET} LOST; GENERAL 'IT WAS BLEEDING'"],
    fortress: ["BUNKER LOST, {NOUN} HURT; COLONEL 'WE NEARLY HAD IT'", "{NAME} TAKES FORTRESS AT A PRICE; GENERAL 'SMALL COMFORT'"],
    swathe: [
      "{TARGET} DOWN, {NOUN} BLEEDING; PROFESSOR 'IT WILL BE BACK'",
      "{PLACE} LOSES ITS {TARGET}; MAYOR 'IT LOOKED TIRED'",
      "{TARGET} FALLS, {NOUN} LIMPS TO SEA; HARBOURMASTER 'WATCH THE TIDE'",
    ],
    coast: ["{NAME} WINS AT {PLACE}, BARELY; COASTGUARD 'BOTH OF THEM BLED'", "{TARGET} DEAD ON THE SAND; VET 'THE WINNER LOOKS NO BETTER'"],
  },
  "total victory-driven": {
    any: ["{TARGET} DRIVEN INTO THE HILLS; MAYOR 'WE DID NOT ASK {NAME} TO STAY'", "{TARGET} FLEES {PLACE}; FISHERMEN 'THE BIG ONE CHASED IT OFF'"],
  },
  "victory-driven": {
    any: ["{TARGET} DRIVEN OFF; DOCTOR '{NAME} NEEDS REST'", "{TARGET} GONE INLAND; COASTGUARD 'THE OTHER ONE STAYED'"],
  },
  "draw-time": {
    any: ["{NOUN} STILL AT LARGE; GENERAL '{TARGET} IS SECURE'", "ARMY HOLDS {TARGET}; GENERAL 'A GOOD NIGHT OF WORK'"],
    fortress: ["FORTRESS HOLDS; GENERAL 'NOTHING ALIVE COULD COME UP THAT VALLEY'", "{NOUN} STILL IN VALLEY; COLONEL 'BUNKER SECURE'"],
    swathe: ["{TARGET} SURVIVES THE NIGHT; MAYOR 'BUSINESS AS USUAL'", "{NOUN} STILL IN {PLACE}; POLICE 'STAY INDOORS'"],
    coast: ["TWO MONSTERS, NO WINNER; MAYOR 'PLEASE GO HOME'", "STALEMATE AT {PLACE}; COASTGUARD 'THEY ARE STILL OUT THERE'"],
  },
  "draw-withdrawn": {
    any: ["{NAME} WITHDRAWS; MAYOR 'SWEEP UP AND CARRY ON'", "{NOUN} LEAVES {PLACE}; GENERAL '{TARGET} NEVER IN DANGER'"],
    fortress: ["{NOUN} TURNS BACK; GENERAL 'AS EXPECTED'", "{NAME} LEAVES VALLEY; COLONEL 'BUNKER NEVER IN DANGER'"],
    swathe: ["{NOUN} RETURNS TO SEA; HARBOURMASTER 'IT WILL BE BACK'", "{TARGET} SPARED; MAYOR 'THE SEA CAN KEEP IT'"],
    coast: ["{NAME} GIVES UP THE BEACH; COASTGUARD 'THE OTHER ONE IS STILL HERE'", "{NOUN} BACK TO SEA; FISHERMEN 'WE ARE NOT GOING OUT TOMORROW'"],
  },
  defeat: {
    any: ["{NOUN} DOWN AT {PLACE}; MAYOR 'CLEAN-UP TO TAKE YEARS'", "{NAME} FELLED AT {PLACE}; GENERAL 'NOT SURPRISED'"],
    fortress: [
      "VALLEY HOLDS; GENERAL 'NOTHING ALIVE COULD COME UP IT'",
      "{NAME} DIES BELOW THE WALL; ARMY 'AS PLANNED'",
      "{NOUN} DOWN AT {PLACE}; COLONEL 'CLEAN-UP TO TAKE YEARS'",
    ],
    swathe: ["{NAME} DIES IN THE STREETS; MAYOR 'OPEN MONDAY'", "{NOUN} DOWN IN {PLACE}; PROFESSOR 'WE WOULD LIKE THE BODY'"],
    coast: ["{TARGET} KEEPS THE BEACH; COASTGUARD 'ONE DOWN, ONE TO GO'", "{NOUN} FALLS AT {PLACE}; FISHERMEN 'THE OTHER ONE ATE WELL'"],
  },
};

// What the papers call each kaiju, and the town each mission happens to.
const PRESS = { radiosaur: "LIZARD", thalassor: "STATUE", squamous: "THING", dairengo: "ROBOT" };
const PLACES = { fortress: "KESSEL", swathe: "PORT HALLORAN", coast: "GULL POINT" };

const ENERGY_WHY = { eat: "the meal", water: "the sea", panic: "fear", drain: "the drain", charge: "the grid", reactor: "the reactor" };

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const lower = (s) => (s ? s[0].toLowerCase() + s.slice(1) : s);
const article = (noun) => `${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`;
const hexes = (n) => `${n} ${n === 1 ? "hex" : "hexes"}`;
const kaijuName = (id) => (KAIJU[id] ? KAIJU[id].name : "the monster");
const unitNoun = (type) => NOUNS[type] || type;
const structureNoun = (type) => (STRUCTURES[type] ? STRUCTURES[type].name.toLowerCase() : type);
const groundName = (id) => (TERRAIN[id] ? TERRAIN[id].name.toLowerCase() : "ground");

function partVars(id, part) {
  const p = KAIJU[id] && KAIJU[id].parts[part];
  const plural = !!(p && p.plural);
  return {
    part: p ? p.name.toLowerCase().replace(/^the /, "") : part,
    is: plural ? "are" : "is",
    has: plural ? "have" : "has",
    takes: plural ? "take" : "takes",
    stops: plural ? "stop" : "stops",
    heals: plural ? "heal" : "heals",
    closes: plural ? "close" : "closes",
    shows: plural ? "show" : "shows",
  };
}

function thingVars(what, type) {
  const thing = what === "unit" ? unitNoun(type) : what === "kaiju" ? kaijuName(type) : structureNoun(type);
  return { thing, aThing: article(thing), ATHING: cap(article(thing)) };
}

function unitVars(type) {
  const unit = unitNoun(type);
  return { unit, aUnit: article(unit), AUNIT: cap(article(unit)) };
}

const isPower = (d) => d.what === "structure" && !!STRUCTURES[d.type] && STRUCTURES[d.type].power;

function bodyName(id) {
  return KAIJU[id] ? KAIJU[id].parts.body.name.toLowerCase() : "body";
}

const VARS = {
  refuse: (d) => ({ vars: { why: d.why || d.text || "That cannot be done." } }),
  phase: (d) => ({ variant: d.phase, vars: { turn: d.turn } }),
  move: (d) => ({
    variant: d.teleport ? "teleport" : d.path && d.path.length === 1 ? "step" : "walk",
    vars: { Name: kaijuName(d.who), walked: hexes(d.path ? d.path.length : 0), cost: d.cost, hexes: hexes(d.from && d.to ? distance(d.from, d.to) : 0) },
  }),
  face: (d) => ({ vars: { Name: kaijuName(d.who), dir: DIR_NAMES[d.dir] } }),
  crush: (d) => ({ variant: isPower(d) ? "power" : d.what, vars: { Name: kaijuName(d.who), ground: "ground", ...thingVars(d.what, d.type) } }),
  attack: (d) => {
    const a = d.attacker;
    const t = d.defender;
    const onKaiju = t.side === "kaiju" || t.side === "rival";
    const weapon = a.side === "unit" && UNITS[a.type] ? UNITS[a.type].weapon : d.attack.name;
    const vars = {
      Attack: cap(d.attack.name),
      attack: lower(d.attack.name),
      Weapon: cap(weapon),
      weapon,
      damage: d.damage,
      rear: d.rear ? ", from behind" : "",
      ground: groundName(d.terrain),
      Target: onKaiju ? kaijuName(t.type) : "",
      Name: a.side === "unit" ? "" : kaijuName(a.type),
      ...(onKaiju ? partVars(t.type, d.part) : thingVars(t.side, t.type)),
      ...(a.side === "unit" ? unitVars(a.type) : {}),
    };
    let kinds;
    if (a.side === "unit") kinds = [d.hit ? "unitHitsKaiju" : "unitMissesKaiju"];
    else if (t.side === "structure") kinds = STRUCTURES[t.type] && STRUCTURES[t.type].populated ? ["kaijuHitsBuilding", "kaijuHitsStructure"] : ["kaijuHitsStructure"];
    else if (t.side === "unit") kinds = [d.zero ? "gaze" : d.hit ? "kaijuHitsUnit" : "kaijuMissesUnit"];
    else kinds = [d.hit ? "kaijuHitsKaiju" : "kaijuMissesKaiju"];
    const id = a.side === "unit" ? a.type : d.attack.id;
    const tail = onKaiju && d.hit && d.spill > 0 ? ` ${d.spill} goes through to the ${bodyName(t.type)}.` : "";
    return { variants: kinds.flatMap((v) => [`${v}.${id}`, v]), vars, tail };
  },
  destroyed: (d) => ({ variant: d.what, vars: { Name: kaijuName(d.type), ...thingVars(d.what, d.type) } }),
  blast: (d) => ({
    variant: d.energy ? "energy" : "damage",
    vars: { Name: kaijuName(d.who), ...thingVars("structure", d.type), damage: d.damage, ...partVars(d.who, d.part) },
    tail: d.spill > 0 ? ` ${d.spill} goes through to the ${bodyName(d.who)}.` : "",
  }),
  panic: (d) => ({ variant: d.broke ? "broke" : "held", vars: unitVars(d.type) }),
  eat: (d) => ({
    variant: isPower(d) ? "power" : d.what,
    vars: { Name: kaijuName(d.who), ...thingVars(d.what, d.type), hunger: d.hunger },
  }),
  energy: (d) => {
    const why = ENERGY_WHY[d.why] || d.why;
    return {
      variant: d.change >= 0 ? "gain" : d.why === "drain" ? "drain" : "loss",
      vars: { Name: kaijuName(d.who), change: Math.abs(d.change), energy: d.energy, why, Why: cap(why) },
    };
  },
  hunger: (d) => ({ variant: d.hunger >= 0.7 * d.max ? "high" : "normal", vars: { Name: kaijuName(d.who), hunger: d.hunger, max: d.max } }),
  part: (d) => ({ variant: d.state, vars: { Name: kaijuName(d.who), ...partVars(d.who, d.part) } }),
  heal: (d) => ({ vars: { Name: kaijuName(d.who), ...partVars(d.who, d.part), hp: d.hp, max: d.max } }),
  roar: (d) => ({ vars: { Name: kaijuName(d.who), radius: d.radius } }),
  berserk: (d) => ({ vars: { Name: kaijuName(d.who) } }),
  reinforce: (d) => ({ vars: unitVars(d.type) }),
  umove: (d) => ({
    variant: d.pulled ? "pulled" : d.path && d.path.length === 1 ? "one" : "many",
    vars: { ...unitVars(d.type), walked: hexes(d.path ? d.path.length : 0), Name: kaijuName(d.who) },
  }),
  withdraw: (d) => ({ vars: { Name: kaijuName(d.who) } }),
  radio: (d) => ({ variant: d.about || "fire", vars: { CALLSIGN: d.callsign } }),
  over: (d) => ({ variant: d.result.outcome, vars: { grade: cap(d.result.grade), total: d.result.score.total } }),
};

function smallHash(text) {
  let n = 0;
  for (let i = 0; i < text.length; i++) n = (n * 31 + text.charCodeAt(i)) % 9973;
  return n;
}

function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (m, name) => (vars[name] === undefined ? "" : String(vars[name])));
}

export function pick(lines, turn, n) {
  return lines[(turn * 7 + n) % lines.length];
}

// The log line for an event. data is the event's data; turn and n (if present) steer the pick.
export function say(k, data = {}) {
  const table = LINES[k];
  const make = VARS[k];
  if (!table || !make) return "";
  const { variant, variants = [variant], vars, tail = "" } = make(data);
  const found = Array.isArray(table) ? table : variants.map((v) => table[v]).find(Boolean);
  const lines = found || Object.values(table)[0];
  const n = data.n !== undefined ? data.n : smallHash(`${data.at || data.to || ""}${data.type || ""}${data.unit || ""}${data.part || ""}`);
  return cap((fill(pick(lines, data.turn || 0, n), vars) + fill(tail, vars)).trim());
}

export function headline(result, state) {
  let target = "THE TARGET";
  const rivalGoal = !!(state && state.objective && state.objective.kind === "rival");
  if (state && state.objective) {
    if (rivalGoal && state.rival) target = kaijuName(state.rival.id).toUpperCase();
    else if (state.objective.type && STRUCTURES[state.objective.type]) target = STRUCTURES[state.objective.type].name.toUpperCase();
  }
  const id = state && state.kaiju ? state.kaiju.id : null;
  const vars = {
    TARGET: target,
    NAME: id ? kaijuName(id).toUpperCase() : "CREATURE",
    NOUN: PRESS[id] || "CREATURE",
    PLACE: (state && PLACES[state.mission]) || (state && placeFromTerrain(state)) || "TOWN",
  };
  let key = result.grade === "draw" ? `draw-${result.outcome === "withdrawn" ? "withdrawn" : "time"}` : result.grade;
  if (rivalGoal && result.outcome === "goal" && state.rival && state.rival.withdrawn) key += "-driven";
  const table = HEADLINES[key] || HEADLINES.defeat;
  const lines = (state && table[state.mission]) || table.any;
  return fill(pick(lines, state ? state.turn : 0, result.score ? result.score.total : 0), vars).toUpperCase();
}

function placeFromTerrain(state) {
  const hex = state.kaiju && state.map && state.map.hexes[state.kaiju.at];
  if (!hex) return null;
  if (TERRAIN[hex.terrain] && TERRAIN[hex.terrain].water) return "THE HARBOUR";
  return hex.structure ? "THE CITY" : null;
}
