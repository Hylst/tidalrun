import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { audio } from "./audio";
import { saveScore, loadScores, type ScoreEntry } from "./scores";

/* ========================================================================
 *  River Raid – Tidal Run
 *  Vertical scrolling naval combat with progressive difficulty,
 *  multiple weapons, many enemy types and pickups, richer animations.
 * ====================================================================== */

const GAME_WIDTH = 640;
const GAME_HEIGHT = 900;
const PLAYER_SCREEN_Y = GAME_HEIGHT * 0.76;
const TWO_PI = Math.PI * 2;

type Phase = "onboarding" | "menu" | "playing" | "paused" | "ended" | "rules";
type ObjectKind =
  | "fuel"
  | "mine"
  | "patrol"
  | "raider"
  | "chopper"
  | "submarine"
  | "jet"
  | "gunboat"
  | "torpedo"
  | "bridge"
  | "repair"
  | "shield"
  | "rapid"
  | "spread"
  | "missile"
  | "turret"
  | "mines"
  | "star"
  | "debris";
type Weapon = "cannon" | "rapid" | "spread" | "missile" | "turret";

type Boat = {
  id: string;
  name: string;
  callsign: string;
  role: string;
  note: string;
  hullColor: string;
  deckColor: string;
  wakeColor: string;
  maxSpeed: number;
  accel: number;
  turnRate: number;
  stability: number;
  fuelBurn: number;
  cooldown: number;
  beam: number;
  length: number;
  armor: number;
  stats: { speed: number; handling: number; armor: number; economy: number };
};

type Inputs = {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  fire: boolean;
  precision: boolean;
  turret: boolean;
  mine: boolean;
};

type PlayerState = {
  x: number;
  heading: number;
  rudder: number;
  speed: number;
  cooldown: number;
  scrape: number;
  shield: number;
  weapon: Weapon;
  weaponAmmo: number;
  rapidTimer: number;
  turretAngle: number;
  turretActive: boolean;
  mineCount: number;
};

type WorldObject = {
  id: number;
  kind: ObjectKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  health: number;
  cooldown: number;
  phase: number;
  value: number;
  alive: boolean;
  destroyed: boolean;
  submerged?: boolean;
  surfacing?: number;
  target?: number;
  isFriendly?: boolean;
};

type Bullet = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  alive: boolean;
  kind: Weapon;
  target?: number;
  trail?: Array<{ x: number; y: number }>;
};

type EnemyShot = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  alive: boolean;
  kind: "bullet" | "torpedo" | "missile";
  target?: number;
};

type Explosion = {
  x: number;
  y: number;
  age: number;
  ttl: number;
  color: string;
  size: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  ttl: number;
  color: string;
  size: number;
  fade: boolean;
};

type FloatText = {
  x: number;
  y: number;
  age: number;
  ttl: number;
  text: string;
  color: string;
};

type RuntimeGame = {
  boat: Boat;
  player: PlayerState;
  objects: WorldObject[];
  bullets: Bullet[];
  enemyShots: EnemyShot[];
  explosions: Explosion[];
  particles: Particle[];
  floats: FloatText[];
  distance: number;
  score: number;
  fuel: number;
  hull: number;
  maxHull: number;
  throttle: number;
  bridges: number;
  combo: number;
  comboTimer: number;
  nextSpawnY: number;
  nextBridgeY: number;
  nextId: number;
  seed: number;
  time: number;
  over: boolean;
  message: string;
  shake: number;
  flash: number;
  tier: number;
  enemiesKilled: number;
  maxCombo: number;
  turretToggle: number;
  mineCooldown: number;
  nextEventY: number;
};

type Metrics = {
  score: number;
  fuel: number;
  hull: number;
  distance: number;
  speed: number;
  throttle: number;
  bridges: number;
  narrowness: number;
  weapon: Weapon;
  ammo: number;
  shield: number;
  combo: number;
  tier: number;
  tierLabel: string;
  enemiesKilled: number;
  maxCombo: number;
  mineCount: number;
  turretActive: boolean;
};

type RiverShape = {
  left: number;
  right: number;
  center: number;
  width: number;
  narrowness: number;
};

/* ---------------- Boats ---------------- */

const BOATS: Boat[] = [
  {
    id: "skiff",
    name: "Delta Skiff",
    callsign: "Swiftwater",
    role: "Balanced patrol boat",
    note: "Responsive rudder, moderate wake drift, forgiving fuel economy.",
    hullColor: "#f97316",
    deckColor: "#fed7aa",
    wakeColor: "rgba(251, 146, 60, 0.32)",
    maxSpeed: 186,
    accel: 1.45,
    turnRate: 1.78,
    stability: 3.4,
    fuelBurn: 0.72,
    cooldown: 0.22,
    beam: 32,
    length: 56,
    armor: 3.2,
    stats: { speed: 4, handling: 4, armor: 3, economy: 4 },
  },
  {
    id: "hydrofoil",
    name: "Kestrel Hydrofoil",
    callsign: "Needle",
    role: "Fast assault craft",
    note: "Very quick and light. Planes over water but punishes oversteer.",
    hullColor: "#38bdf8",
    deckColor: "#e0f2fe",
    wakeColor: "rgba(56, 189, 248, 0.36)",
    maxSpeed: 232,
    accel: 1.72,
    turnRate: 2.15,
    stability: 2.45,
    fuelBurn: 1.05,
    cooldown: 0.18,
    beam: 27,
    length: 58,
    armor: 2.1,
    stats: { speed: 5, handling: 5, armor: 2, economy: 2 },
  },
  {
    id: "tug",
    name: "Harbor Tug Defender",
    callsign: "Anchor",
    role: "Armored river tug",
    note: "Heavy hull, slow response, excellent control in tight passages.",
    hullColor: "#64748b",
    deckColor: "#cbd5e1",
    wakeColor: "rgba(148, 163, 184, 0.3)",
    maxSpeed: 146,
    accel: 0.88,
    turnRate: 1.36,
    stability: 4.8,
    fuelBurn: 0.55,
    cooldown: 0.33,
    beam: 42,
    length: 58,
    armor: 5,
    stats: { speed: 2, handling: 3, armor: 5, economy: 5 },
  },
  {
    id: "cutter",
    name: "Northwind Cutter",
    callsign: "Keelmark",
    role: "Stable river cutter",
    note: "Long keel and steady aim. Best for bridge runs and fuel discipline.",
    hullColor: "#22c55e",
    deckColor: "#dcfce7",
    wakeColor: "rgba(34, 197, 94, 0.32)",
    maxSpeed: 174,
    accel: 1.05,
    turnRate: 1.6,
    stability: 4.25,
    fuelBurn: 0.64,
    cooldown: 0.26,
    beam: 35,
    length: 64,
    armor: 3.9,
    stats: { speed: 3, handling: 4, armor: 4, economy: 4 },
  },
];

/* ---------------- Helpers ---------------- */

const blankInputs = (): Inputs => ({
  left: false,
  right: false,
  up: false,
  down: false,
  fire: false,
  precision: false,
  turret: false,
  mine: false,
});

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatScore(value: number) {
  return Math.max(0, Math.round(value)).toLocaleString("en-US");
}

function pseudo(value: number) {
  const raw = Math.sin(value * 127.1 + 311.7) * 43758.5453123;
  return raw - Math.floor(raw);
}

function seededRandom(game: RuntimeGame) {
  game.seed = (game.seed * 1664525 + 1013904223) >>> 0;
  return game.seed / 4294967296;
}

function randomRange(game: RuntimeGame, min: number, max: number) {
  return min + (max - min) * seededRandom(game);
}

function randomPick<T>(game: RuntimeGame, options: T[]): T {
  return options[Math.floor(seededRandom(game) * options.length)];
}

/* ---------------- River ---------------- */

function riverAt(worldY: number): RiverShape {
  const bend =
    Math.sin(worldY * 0.0058) * 62 +
    Math.sin(worldY * 0.013 + 1.8) * 32 +
    Math.sin(worldY * 0.0022 + 2.4) * 40;
  const difficulty = clamp(worldY / 15000, 0, 1);
  const phase = ((worldY + 260) % 1420) / 1420;
  const throat = Math.exp(-Math.pow((phase - 0.53) / 0.125, 2));
  const baseWidth =
    388 -
    difficulty * 78 +
    Math.sin(worldY * 0.0042 + 0.5) * 34 +
    Math.sin(worldY * 0.0105) * 22 -
    throat * (124 + difficulty * 48);
  const width = clamp(baseWidth, 180, 440);
  const center = clamp(GAME_WIDTH / 2 + bend, width / 2 + 24, GAME_WIDTH - width / 2 - 24);
  return {
    left: center - width / 2,
    right: center + width / 2,
    center,
    width,
    narrowness: clamp((260 - width) / 95, 0, 1),
  };
}

/* ---------------- Difficulty tiers ---------------- */

type Tier = {
  id: number;
  name: string;
  description: string;
  spawnGap: [number, number];
  enemySpeed: number;
  enemyFire: number;
  pickupBonus: number;
  fuelBias: number;
  allowed: ObjectKind[];
};

const TIERS: Tier[] = [
  {
    id: 1,
    name: "Training Run",
    description: "Light traffic, generous supplies.",
    spawnGap: [250, 340],
    enemySpeed: 0.55,
    enemyFire: 0.5,
    pickupBonus: 0.06,
    fuelBias: 0.22,
    allowed: ["mine", "fuel"],
  },
  {
    id: 2,
    name: "Maiden Voyage",
    description: "Patrol boats appear. Pickups are frequent.",
    spawnGap: [230, 320],
    enemySpeed: 0.68,
    enemyFire: 0.6,
    pickupBonus: 0.04,
    fuelBias: 0.18,
    allowed: ["mine", "fuel", "patrol"],
  },
  {
    id: 3,
    name: "Coastal Patrol",
    description: "Raider skiffs join the river.",
    spawnGap: [215, 300],
    enemySpeed: 0.78,
    enemyFire: 0.7,
    pickupBonus: 0.03,
    fuelBias: 0.14,
    allowed: ["mine", "fuel", "patrol", "raider", "repair"],
  },
  {
    id: 4,
    name: "Delta Crossfire",
    description: "Choppers overhead, shield drops appear.",
    spawnGap: [200, 285],
    enemySpeed: 0.86,
    enemyFire: 0.82,
    pickupBonus: 0.025,
    fuelBias: 0.1,
    allowed: ["mine", "fuel", "patrol", "raider", "chopper", "repair", "shield"],
  },
  {
    id: 5,
    name: "Minesweeper Sweep",
    description: "Mine density rises, submarines surface.",
    spawnGap: [185, 270],
    enemySpeed: 0.95,
    enemyFire: 0.9,
    pickupBonus: 0.02,
    fuelBias: 0.07,
    allowed: ["mine", "fuel", "patrol", "raider", "chopper", "submarine", "repair", "shield", "rapid", "mines", "turret"],
  },
  {
    id: 6,
    name: "Gunboat Alley",
    description: "Heavy gunboats and rapid-fire pickups.",
    spawnGap: [170, 255],
    enemySpeed: 1.05,
    enemyFire: 1.0,
    pickupBonus: 0.02,
    fuelBias: 0.05,
    allowed: ["mine", "fuel", "patrol", "raider", "chopper", "submarine", "gunboat", "repair", "shield", "rapid", "spread", "turret", "mines"],
  },
  {
    id: 7,
    name: "Storm Front",
    description: "Jets streak over the river.",
    spawnGap: [155, 240],
    enemySpeed: 1.12,
    enemyFire: 1.08,
    pickupBonus: 0.02,
    fuelBias: 0.03,
    allowed: ["mine", "fuel", "patrol", "raider", "chopper", "submarine", "gunboat", "jet", "repair", "shield", "rapid", "spread", "missile", "turret", "mines", "debris"],
  },
  {
    id: 8,
    name: "Iron Gauntlet",
    description: "Torpedoes and heavy fire.",
    spawnGap: [145, 225],
    enemySpeed: 1.2,
    enemyFire: 1.18,
    pickupBonus: 0.02,
    fuelBias: 0.02,
    allowed: ["mine", "fuel", "patrol", "raider", "chopper", "submarine", "gunboat", "jet", "repair", "shield", "rapid", "spread", "missile", "turret", "mines", "debris"],
  },
  {
    id: 9,
    name: "Admiral's Reach",
    description: "Every threat active, narrow passages.",
    spawnGap: [135, 210],
    enemySpeed: 1.3,
    enemyFire: 1.28,
    pickupBonus: 0.02,
    fuelBias: 0.01,
    allowed: ["mine", "fuel", "patrol", "raider", "chopper", "submarine", "gunboat", "jet", "repair", "shield", "rapid", "spread", "missile", "turret", "mines", "debris", "star"],
  },
  {
    id: 10,
    name: "Endless Tide",
    description: "The river never forgives.",
    spawnGap: [125, 195],
    enemySpeed: 1.42,
    enemyFire: 1.4,
    pickupBonus: 0.02,
    fuelBias: 0.01,
    allowed: ["mine", "fuel", "patrol", "raider", "chopper", "submarine", "gunboat", "jet", "repair", "shield", "rapid", "spread", "missile", "turret", "mines", "debris", "star"],
  },
];

function tierFor(distance: number): Tier {
  const index = Math.min(TIERS.length - 1, Math.floor(distance / 1350));
  return TIERS[index];
}

/* ---------------- Game creation ---------------- */

function createGame(boat: Boat): RuntimeGame {
  const maxHull = 100 + boat.armor * 9;
  return {
    boat,
    player: {
      x: GAME_WIDTH / 2,
      heading: 0,
      rudder: 0,
      speed: 64,
      cooldown: 0,
      scrape: 0,
      shield: 0,
      weapon: "cannon",
      weaponAmmo: 0,
      rapidTimer: 0,
      turretAngle: 0,
      turretActive: false,
      mineCount: 0,
    },
    objects: [],
    bullets: [],
    enemyShots: [],
    explosions: [],
    particles: [],
    floats: [],
    distance: 0,
    score: 0,
    fuel: 100,
    hull: maxHull,
    maxHull,
    throttle: 0.34,
    bridges: 0,
    combo: 0,
    comboTimer: 0,
    nextSpawnY: 270,
    nextBridgeY: 1120,
    nextId: 1,
    seed: 87521 + Math.floor(Math.random() * 900000),
    time: 0,
    over: false,
    message: "Mission complete.",
    shake: 0,
    flash: 0,
    tier: 1,
    enemiesKilled: 0,
    maxCombo: 0,
    turretToggle: 0,
    mineCooldown: 0,
    nextEventY: 2000,
  };
}

function metricsFromGame(game: RuntimeGame): Metrics {
  const river = riverAt(game.distance + 24);
  const tier = tierFor(game.distance);
  return {
    score: Math.round(game.score),
    fuel: clamp(game.fuel, 0, 100),
    hull: clamp((game.hull / game.maxHull) * 100, 0, 100),
    distance: game.distance,
    speed: game.player.speed,
    throttle: game.throttle,
    bridges: game.bridges,
    narrowness: river.narrowness,
    weapon: game.player.weapon,
    ammo: game.player.weaponAmmo,
    shield: game.player.shield,
    combo: game.combo,
    tier: tier.id,
    tierLabel: tier.name,
    enemiesKilled: game.enemiesKilled,
    maxCombo: game.maxCombo,
    mineCount: game.player.mineCount,
    turretActive: game.player.turretActive,
  };
}

function screenY(game: RuntimeGame, worldY: number) {
  return PLAYER_SCREEN_Y - (worldY - game.distance);
}

/* ---------------- Spawn helpers ---------------- */

function spawnExplosion(game: RuntimeGame, x: number, y: number, color = "#f97316", size = 34) {
  game.explosions.push({ x, y, age: 0, ttl: 0.62, color, size });
  audio.playSfx("explosion");
}

function spawnParticles(game: RuntimeGame, x: number, y: number, color: string, count = 12, speed = 110) {
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * TWO_PI + seededRandom(game) * 0.4;
    const v = speed * (0.5 + seededRandom(game) * 0.8);
    game.particles.push({
      x,
      y,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v,
      age: 0,
      ttl: 0.38 + seededRandom(game) * 0.5,
      color,
      size: 2 + seededRandom(game) * 3,
      fade: true,
    });
  }
}

function spawnFloat(game: RuntimeGame, x: number, y: number, text: string, color = "#fde047") {
  game.floats.push({ x, y, age: 0, ttl: 1.05, text, color });
}

function addComboKill(game: RuntimeGame, x: number, y: number, value: number) {
  game.combo = Math.min(game.combo + 1, 12);
  game.maxCombo = Math.max(game.maxCombo, game.combo);
  game.comboTimer = 4;
  const bonus = Math.floor(value * (1 + (game.combo - 1) * 0.25));
  game.score += bonus;
  if (game.combo >= 3) audio.playSfx("combo");
  spawnFloat(game, x, y, `+${bonus}${game.combo > 1 ? ` x${game.combo}` : ""}`);
}

/* ---------------- Object factory ---------------- */

function createObject(game: RuntimeGame, kind: ObjectKind, y: number): WorldObject {
  const channel = riverAt(y);
  const margin = kind === "mine" ? 32 : 48;
  const safeLeft = Math.min(channel.center - 8, channel.left + margin);
  const safeRight = Math.max(channel.center + 8, channel.right - margin);
  const inRiverX = randomRange(game, safeLeft, safeRight);
  const side = seededRandom(game) > 0.5 ? 1 : -1;
  const tier = tierFor(game.distance);

  if (kind === "bridge") {
    return {
      id: game.nextId++,
      kind,
      x: channel.center,
      y,
      vx: 0,
      vy: 0,
      radius: channel.width / 2,
      health: 5 + Math.floor(game.distance / 5200),
      cooldown: 0,
      phase: seededRandom(game) * TWO_PI,
      value: 650 + game.bridges * 100,
      alive: true,
      destroyed: false,
    };
  }

  if (kind === "chopper") {
    return {
      id: game.nextId++,
      kind,
      x: side > 0 ? -52 : GAME_WIDTH + 52,
      y,
      vx: (side > 0 ? 1 : -1) * randomRange(game, 72, 108) * tier.enemySpeed,
      vy: -10,
      radius: 24,
      health: 2,
      cooldown: randomRange(game, 0.8, 2.2),
      phase: seededRandom(game) * TWO_PI,
      value: 180,
      alive: true,
      destroyed: false,
    };
  }

  if (kind === "jet") {
    return {
      id: game.nextId++,
      kind,
      x: side > 0 ? -70 : GAME_WIDTH + 70,
      y,
      vx: (side > 0 ? 1 : -1) * randomRange(game, 260, 320) * tier.enemySpeed,
      vy: 0,
      radius: 22,
      health: 1,
      cooldown: randomRange(game, 0.6, 1.1),
      phase: seededRandom(game) * TWO_PI,
      value: 220,
      alive: true,
      destroyed: false,
    };
  }

  if (kind === "submarine") {
    return {
      id: game.nextId++,
      kind,
      x: inRiverX,
      y,
      vx: side * randomRange(game, 10, 22) * tier.enemySpeed,
      vy: -6,
      radius: 22,
      health: 3,
      cooldown: randomRange(game, 1.2, 2.4),
      phase: seededRandom(game) * TWO_PI,
      value: 210,
      alive: true,
      destroyed: false,
      submerged: true,
      surfacing: 0,
    };
  }

  if (kind === "gunboat") {
    return {
      id: game.nextId++,
      kind,
      x: inRiverX,
      y,
      vx: side * randomRange(game, 16, 32) * tier.enemySpeed,
      vy: -10,
      radius: 32,
      health: 4,
      cooldown: randomRange(game, 0.9, 1.7),
      phase: seededRandom(game) * TWO_PI,
      value: 260,
      alive: true,
      destroyed: false,
    };
  }

  if (kind === "patrol") {
    return {
      id: game.nextId++,
      kind,
      x: inRiverX,
      y,
      vx: side * randomRange(game, 24, 42) * tier.enemySpeed,
      vy: -15,
      radius: 23,
      health: 2,
      cooldown: randomRange(game, 1.1, 2.4),
      phase: seededRandom(game) * TWO_PI,
      value: 150,
      alive: true,
      destroyed: false,
    };
  }

  if (kind === "raider") {
    return {
      id: game.nextId++,
      kind,
      x: inRiverX,
      y,
      vx: side * randomRange(game, 46, 78) * tier.enemySpeed,
      vy: -44,
      radius: 18,
      health: 1,
      cooldown: 0,
      phase: seededRandom(game) * TWO_PI,
      value: 115,
      alive: true,
      destroyed: false,
    };
  }

  if (kind === "mine") {
    return {
      id: game.nextId++,
      kind,
      x: inRiverX,
      y,
      vx: 0,
      vy: 0,
      radius: 16,
      health: 1,
      cooldown: 0,
      phase: seededRandom(game) * TWO_PI,
      value: 90,
      alive: true,
      destroyed: false,
    };
  }

  if (kind === "debris") {
    return {
      id: game.nextId++,
      kind,
      x: inRiverX,
      y,
      vx: Math.sin(y * 0.017 + game.seed) * 6,
      vy: -20 - seededRandom(game) * 16,
      radius: 14,
      health: 1,
      cooldown: 0,
      phase: seededRandom(game) * TWO_PI,
      value: 40,
      alive: true,
      destroyed: false,
    };
  }

  const pickupBase: WorldObject = {
    id: game.nextId++,
    kind: "fuel",
    x: inRiverX,
    y,
    vx: Math.sin(y * 0.013) * 8,
    vy: 0,
    radius: 19,
    health: 1,
    cooldown: 0,
    phase: seededRandom(game) * TWO_PI,
    value: 70,
    alive: true,
    destroyed: false,
  };

  if (kind === "fuel") return { ...pickupBase, kind: "fuel", value: 70 };
  if (kind === "repair") return { ...pickupBase, kind: "repair", value: 120, vx: Math.sin(y * 0.011) * 6 };
  if (kind === "shield") return { ...pickupBase, kind: "shield", value: 90, vx: Math.sin(y * 0.009) * 7 };
  if (kind === "rapid") return { ...pickupBase, kind: "rapid", value: 100, vx: Math.sin(y * 0.015) * 8 };
  if (kind === "spread") return { ...pickupBase, kind: "spread", value: 110, vx: Math.sin(y * 0.015) * 8 };
  if (kind === "missile") return { ...pickupBase, kind: "missile", value: 140, vx: Math.sin(y * 0.015) * 8 };
  if (kind === "turret") return { ...pickupBase, kind: "turret", value: 120, vx: Math.sin(y * 0.015) * 8 };
  if (kind === "mines") return { ...pickupBase, kind: "mines", value: 80, vx: Math.sin(y * 0.015) * 8 };
  return { ...pickupBase, kind: "star", value: 350, vx: Math.sin(y * 0.02) * 10 };
}

/* ---------------- World spawning ---------------- */

function spawnWorld(game: RuntimeGame) {
  const aheadLimit = game.distance + GAME_HEIGHT + 720;
  const tier = tierFor(game.distance);

  while (game.nextBridgeY < aheadLimit) {
    game.objects.push(createObject(game, "bridge", game.nextBridgeY));
    game.nextBridgeY += randomRange(game, 1250, 1680);
  }

  while (game.nextSpawnY < aheadLimit) {
    const y = game.nextSpawnY;
    const bridgeDistances = game.objects
      .filter((object) => object.kind === "bridge")
      .map((bridge) => Math.abs(y - bridge.y));
    const nearestBridge = Math.min(Math.abs(y - game.nextBridgeY), ...bridgeDistances);

    if (nearestBridge > 145) {
      const roll = seededRandom(game);
      const pickupChance = 0.17 + tier.pickupBonus;
      const hazardChance = 0.15 + clamp(tier.id * 0.025, 0, 0.22);

      if (roll < pickupChance) {
        const pickupOptions: ObjectKind[] = tier.allowed.filter(
          (k) =>
            k === "fuel" ||
            k === "repair" ||
            k === "shield" ||
            k === "rapid" ||
            k === "spread" ||
            k === "missile" ||
            k === "turret" ||
            k === "mines" ||
            k === "star",
        );
        const fuelWeight = Math.max(0.25, 0.7 - tier.fuelBias * 2.5);
        const isFuel = seededRandom(game) < fuelWeight && pickupOptions.includes("fuel");
        const choice: ObjectKind = isFuel
          ? "fuel"
          : randomPick(
              game,
              pickupOptions.filter((k) => k !== "fuel"),
            );
        game.objects.push(createObject(game, choice, y));
      } else if (roll < pickupChance + hazardChance) {
        const hazardOptions: ObjectKind[] = tier.allowed.filter(
          (k) =>
            k === "mine" ||
            k === "patrol" ||
            k === "raider" ||
            k === "chopper" ||
            k === "submarine" ||
            k === "gunboat" ||
            k === "jet" ||
            k === "debris",
        );
        const choice = randomPick(game, hazardOptions);
        game.objects.push(createObject(game, choice, y));
      }
    }

    game.nextSpawnY += randomRange(game, tier.spawnGap[0], tier.spawnGap[1]);
  }
}

/* ---------------- Damage & firing ---------------- */

function applyDamage(game: RuntimeGame, amount: number, message = "Hull breached in hostile water.") {
  if (game.over) return;
  if (game.player.shield > 0) {
    game.player.shield = Math.max(0, game.player.shield - 1.4);
    game.flash = Math.max(game.flash, 0.35);
    game.shake = Math.max(game.shake, 8);
    audio.playSfx("shield");
    return;
  }
  audio.playSfx("hurt");
  const mitigation = clamp(1 - game.boat.armor * 0.045, 0.72, 0.92);
  game.hull = Math.max(0, game.hull - amount * mitigation);
  game.player.scrape = Math.max(game.player.scrape, 0.28);
  game.shake = Math.max(game.shake, 12 + amount * 0.1);
  game.flash = Math.max(game.flash, 0.3);
  spawnParticles(game, game.player.x, game.distance, "#fb923c", 14, 160);
  if (game.hull <= 0) {
    game.over = true;
    game.message = message;
  }
}

function firePlayer(game: RuntimeGame) {
  audio.playSfx("shoot");
  const heading = game.player.heading;
  const player = game.player;
  const baseVy = 470 + player.speed * 0.35;

  if (player.weapon === "spread") {
    const angles = [-0.28, -0.1, 0.1, 0.28];
    for (const offset of angles) {
      const angle = heading + offset;
      game.bullets.push({
        x: game.player.x + Math.sin(angle) * 20,
        y: game.distance + 24,
        vx: Math.sin(angle) * 130,
        vy: baseVy * 0.96,
        life: 1.1,
        alive: true,
        kind: "spread",
      });
    }
    player.weaponAmmo -= 1;
    if (player.weaponAmmo <= 0) player.weapon = "cannon";
    return;
  }

  if (player.weapon === "missile") {
    const target = findNearestEnemy(game, game.player.x, game.distance + 240);
    game.bullets.push({
      x: game.player.x + Math.sin(heading) * 18,
      y: game.distance + 24,
      vx: Math.sin(heading) * 120,
      vy: baseVy,
      life: 2.2,
      alive: true,
      kind: "missile",
      target: target ?? undefined,
      trail: [],
    });
    player.weaponAmmo -= 1;
    if (player.weaponAmmo <= 0) player.weapon = "cannon";
    return;
  }

  if (player.weapon === "turret") {
    const fireAngle = heading + player.turretAngle;
    game.bullets.push({
      x: game.player.x + Math.sin(fireAngle) * 22,
      y: game.distance + 24,
      vx: Math.sin(fireAngle) * 150,
      vy: baseVy * 0.9,
      life: 1.3,
      alive: true,
      kind: "turret",
    });
    player.weaponAmmo -= 1;
    if (player.weaponAmmo <= 0) { player.weapon = "cannon"; player.turretActive = false; }
    return;
  }

  if (player.weapon === "rapid" || player.rapidTimer > 0) {
    game.bullets.push({
      x: game.player.x + Math.sin(heading) * 18 - 7,
      y: game.distance + 24,
      vx: Math.sin(heading) * 120 - 22,
      vy: baseVy,
      life: 1.5,
      alive: true,
      kind: "rapid",
    });
    game.bullets.push({
      x: game.player.x + Math.sin(heading) * 18 + 7,
      y: game.distance + 24,
      vx: Math.sin(heading) * 120 + 22,
      vy: baseVy,
      life: 1.5,
      alive: true,
      kind: "rapid",
    });
    if (player.weapon === "rapid") {
      player.weaponAmmo -= 1;
      if (player.weaponAmmo <= 0) player.weapon = "cannon";
    }
    return;
  }

  game.bullets.push({
    x: game.player.x + Math.sin(heading) * 18,
    y: game.distance + 24,
    vx: Math.sin(heading) * 120,
    vy: baseVy,
    life: 1.55,
    alive: true,
    kind: "cannon",
  });
}

function findNearestEnemy(game: RuntimeGame, x: number, y: number): number | null {
  let best: { id: number; dist: number } | null = null;
  for (const object of game.objects) {
    if (!object.alive || object.destroyed) continue;
    if (object.isFriendly || object.kind === "fuel" || object.kind === "repair" || object.kind === "shield" || object.kind === "rapid" || object.kind === "spread" || object.kind === "missile" || object.kind === "turret" || object.kind === "mines" || object.kind === "star" || object.kind === "debris") continue;
    const d = Math.hypot(object.x - x, object.y - y);
    if (!best || d < best.dist) best = { id: object.id, dist: d };
  }
  return best ? best.id : null;
}

function shootEnemy(game: RuntimeGame, object: WorldObject, kind: EnemyShot["kind"] = "bullet") {
  const dx = game.player.x - object.x;
  const speed = kind === "torpedo" ? 170 : kind === "missile" ? 260 : 215;
  game.enemyShots.push({
    x: object.x,
    y: object.y - 4,
    vx: clamp(dx * (kind === "missile" ? 1.4 : 0.72), -140, 140),
    vy: -speed,
    life: kind === "torpedo" ? 3.4 : 2.9,
    alive: true,
    kind,
    target: undefined,
  });
}

function damageObject(game: RuntimeGame, object: WorldObject, amount: number) {
  object.health -= amount;
  spawnExplosion(game, object.x, object.y, object.kind === "fuel" ? "#facc15" : "#fb923c", 20);
  spawnParticles(game, object.x, object.y, "#fed7aa", 6, 90);

  if (object.health > 0) return;

  if (object.kind === "bridge") {
    object.destroyed = true;
    game.bridges += 1;
    game.score += object.value;
    audio.playSfx("bridge");
    spawnExplosion(game, object.x, object.y, "#fde68a", 80);
    spawnExplosion(game, object.x - 58, object.y + 4, "#fb923c", 52);
    spawnExplosion(game, object.x + 58, object.y - 4, "#fb923c", 52);
    spawnParticles(game, object.x, object.y, "#fde047", 28, 210);
    spawnFloat(game, object.x, object.y, `+${object.value} BRIDGE`, "#fde047");
    game.shake = Math.max(game.shake, 16);
    return;
  }

  object.alive = false;
  game.enemiesKilled += 1;
  spawnExplosion(game, object.x, object.y, object.kind === "mine" ? "#f43f5e" : "#fb923c", 42);
  spawnParticles(game, object.x, object.y, "#fca5a5", 10, 140);
  addComboKill(game, object.x, object.y, object.value);
}

/* ---------------- Update functions ---------------- */

function updateBullets(game: RuntimeGame, dt: number) {
  for (const bullet of game.bullets) {
    if (bullet.kind === "missile" && bullet.target !== undefined) {
      const target = game.objects.find((o) => o.id === bullet.target);
      if (target && target.alive && !target.destroyed) {
        const dx = target.x - bullet.x;
        const dy = target.y - bullet.y;
        const dist = Math.hypot(dx, dy) || 1;
        const speed = Math.hypot(bullet.vx, bullet.vy) || 1;
        const desiredVx = (dx / dist) * speed;
        const desiredVy = (dy / dist) * speed;
        bullet.vx += (desiredVx - bullet.vx) * clamp(3.5 * dt, 0, 0.9);
        bullet.vy += (desiredVy - bullet.vy) * clamp(3.5 * dt, 0, 0.9);
      }
    }

    if (bullet.trail) {
      bullet.trail.push({ x: bullet.x, y: bullet.y });
      if (bullet.trail.length > 12) bullet.trail.shift();
    }

    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.life -= dt;
    bullet.alive = bullet.alive && bullet.life > 0 && bullet.y < game.distance + GAME_HEIGHT + 750;
  }

  for (const shot of game.enemyShots) {
    if (shot.kind === "missile") {
      const dx = game.player.x - shot.x;
      const dy = game.distance - shot.y;
      const dist = Math.hypot(dx, dy) || 1;
      const speed = Math.hypot(shot.vx, shot.vy) || 1;
      const desiredVx = (dx / dist) * speed;
      const desiredVy = (dy / dist) * speed;
      shot.vx += (desiredVx - shot.vx) * clamp(2.2 * dt, 0, 0.6);
      shot.vy += (desiredVy - shot.vy) * clamp(2.2 * dt, 0, 0.6);
    }

    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;
    shot.life -= dt;
    shot.alive = shot.alive && shot.life > 0 && shot.y > game.distance - 260;
  }
}

function updateObjects(game: RuntimeGame, dt: number) {
  const tier = tierFor(game.distance);

  for (const object of game.objects) {
    if (!object.alive && object.kind !== "bridge") continue;

    if (object.kind === "chopper") {
      object.x += object.vx * dt;
      object.y += object.vy * dt;
      object.cooldown -= dt;
      const visibleY = screenY(game, object.y);
      if (visibleY > 64 && visibleY < PLAYER_SCREEN_Y - 80 && object.cooldown <= 0) {
        shootEnemy(game, object, "bullet");
        object.cooldown = randomRange(game, 1.0, 2.0) / tier.enemyFire;
      }
    }

    if (object.kind === "jet") {
      object.x += object.vx * dt;
      object.y += object.vy * dt;
      object.cooldown -= dt;
      const visibleY = screenY(game, object.y);
      if (visibleY > 120 && visibleY < PLAYER_SCREEN_Y - 200 && object.cooldown <= 0) {
        shootEnemy(game, object, "missile");
        object.cooldown = randomRange(game, 0.8, 1.5) / tier.enemyFire;
      }
    }

    if (object.kind === "submarine") {
      const channel = riverAt(object.y);
      const margin = object.radius + 22;
      object.x += (object.vx + Math.sin(game.time * 1.4 + object.phase) * 8) * dt;
      object.y += object.vy * dt;
      if (object.x < channel.left + margin || object.x > channel.right - margin) {
        object.vx *= -1;
        object.x = clamp(object.x, channel.left + margin, channel.right - margin);
      }
      object.surfacing = (object.surfacing ?? 0) + dt;
      object.submerged = Math.sin((object.surfacing ?? 0) * 1.2 + object.phase) < 0.2;
      object.cooldown -= dt;
      const visibleY = screenY(game, object.y);
      if (visibleY > 80 && visibleY < PLAYER_SCREEN_Y - 110 && object.cooldown <= 0 && !object.submerged) {
        shootEnemy(game, object, "torpedo");
        object.cooldown = randomRange(game, 1.4, 2.4) / tier.enemyFire;
      }
    }

    if (object.kind === "gunboat") {
      const channel = riverAt(object.y);
      const margin = object.radius + 28;
      object.x += (object.vx + Math.sin(game.time * 1.1 + object.phase) * 10) * dt;
      object.y += object.vy * dt;
      if (object.x < channel.left + margin || object.x > channel.right - margin) {
        object.vx *= -1;
        object.x = clamp(object.x, channel.left + margin, channel.right - margin);
      }
      object.cooldown -= dt;
      const visibleY = screenY(game, object.y);
      if (visibleY > 80 && visibleY < PLAYER_SCREEN_Y - 120 && object.cooldown <= 0) {
        for (let i = 0; i < 3; i += 1) {
          setTimeout(() => {
            if (!object.alive) return;
            shootEnemy(game, object, "bullet");
          }, i * 90);
        }
        object.cooldown = randomRange(game, 1.6, 2.6) / tier.enemyFire;
      }
    }

    if (object.kind === "patrol" || object.kind === "raider") {
      const channel = riverAt(object.y);
      const margin = object.radius + 22;
      object.x += (object.vx + Math.sin(game.time * 2.2 + object.phase) * 16) * dt;
      object.y += object.vy * dt;
      if (object.x < channel.left + margin || object.x > channel.right - margin) {
        object.vx *= -1;
        object.x = clamp(object.x, channel.left + margin, channel.right - margin);
      }
      object.cooldown -= dt;
      const visibleY = screenY(game, object.y);
      if (object.kind === "patrol" && visibleY > 80 && visibleY < PLAYER_SCREEN_Y - 110 && object.cooldown <= 0) {
        shootEnemy(game, object, "bullet");
        object.cooldown = randomRange(game, 1.45, 2.6) / tier.enemyFire;
      }
    }

    if (
      object.kind === "fuel" ||
      object.kind === "repair" ||
      object.kind === "shield" ||
      object.kind === "rapid" ||
      object.kind === "spread" ||
      object.kind === "missile" ||
      object.kind === "star"
    ) {
      const channel = riverAt(object.y);
      object.x += Math.sin(game.time * 1.6 + object.phase) * 7 * dt + object.vx * dt * 0.2;
      object.x = clamp(object.x, channel.left + object.radius + 18, channel.right - object.radius - 18);
    }
  }
}

function collideBullets(game: RuntimeGame) {
  for (const bullet of game.bullets) {
    if (!bullet.alive) continue;
    for (const object of game.objects) {
      if (!object.alive || object.destroyed) continue;
      if (object.kind === "submarine" && object.submerged) continue;
      if (object.kind === "bridge") {
        const channel = riverAt(object.y);
        const insideBridge = bullet.x > channel.left - 18 && bullet.x < channel.right + 18;
        if (insideBridge && Math.abs(bullet.y - object.y) < 20) {
          bullet.alive = false;
          damageObject(game, object, bullet.kind === "missile" ? 2 : 1);
          break;
        }
      } else {
        const dx = bullet.x - object.x;
        const dy = bullet.y - object.y;
        if (Math.hypot(dx, dy) < object.radius + 8) {
          bullet.alive = false;
          damageObject(game, object, bullet.kind === "missile" ? 2 : 1);
          break;
        }
      }
    }
  }
}

function collidePlayer(game: RuntimeGame) {
  const player = game.player;
  const boat = game.boat;
  const collisionRadius = Math.max(boat.beam * 0.55, 16);

  for (const shot of game.enemyShots) {
    if (!shot.alive) continue;
    const dx = shot.x - player.x;
    const dy = shot.y - game.distance;
    if (Math.hypot(dx, dy) < collisionRadius + 8) {
      shot.alive = false;
      spawnExplosion(game, shot.x, shot.y, "#f87171", 25);
      const damage = shot.kind === "torpedo" ? 26 : shot.kind === "missile" ? 22 : 18;
      applyDamage(game, damage, "Enemy fire disabled the boat.");
    }
  }

  for (const object of game.objects) {
    if (!object.alive && object.kind !== "bridge") continue;
    if (object.isFriendly) continue;
    const dy = object.y - game.distance;

    if (object.kind === "bridge") {
      if (!object.destroyed && Math.abs(dy) < boat.length * 0.34) {
        game.hull = 0;
        game.over = true;
        game.message = "Bridge target not cleared before impact.";
        spawnExplosion(game, player.x, game.distance + 4, "#fecaca", 90);
        spawnParticles(game, player.x, game.distance + 4, "#fca5a5", 30, 240);
      }
      continue;
    }

    if (Math.abs(dy) > 66) continue;

    const dx = object.x - player.x;
    const hitDistance = collisionRadius + object.radius;
    if (Math.hypot(dx, dy) > hitDistance) continue;

    if (object.kind === "fuel") {
      object.alive = false;
      game.fuel = clamp(game.fuel + 32, 0, 100);
      game.score += object.value;
      audio.playSfx("pickup");
      spawnExplosion(game, object.x, object.y, "#fde047", 34);
      spawnParticles(game, object.x, object.y, "#fde047", 8, 60);
      spawnFloat(game, object.x, object.y, "+FUEL", "#fde047");
      continue;
    }
    if (object.kind === "repair") {
      object.alive = false;
      game.hull = Math.min(game.maxHull, game.hull + 45);
      game.score += object.value;
      spawnExplosion(game, object.x, object.y, "#86efac", 34);
      spawnFloat(game, object.x, object.y, "+REPAIR", "#86efac");
      continue;
    }
    if (object.kind === "shield") {
      object.alive = false;
      player.shield = Math.min(6, player.shield + 3);
      game.score += object.value;
      spawnExplosion(game, object.x, object.y, "#93c5fd", 34);
      spawnFloat(game, object.x, object.y, "+SHIELD", "#93c5fd");
      continue;
    }
    if (object.kind === "rapid") {
      object.alive = false;
      player.weapon = "rapid";
      player.weaponAmmo = 18;
      game.score += object.value;
      spawnExplosion(game, object.x, object.y, "#fca5a5", 34);
      spawnFloat(game, object.x, object.y, "+RAPID FIRE", "#fca5a5");
      continue;
    }
    if (object.kind === "spread") {
      object.alive = false;
      player.weapon = "spread";
      player.weaponAmmo = 8;
      game.score += object.value;
      spawnExplosion(game, object.x, object.y, "#c4b5fd", 34);
      spawnFloat(game, object.x, object.y, "+SPREAD", "#c4b5fd");
      continue;
    }
    if (object.kind === "missile") {
      object.alive = false;
      player.weapon = "missile";
      player.weaponAmmo = 6;
      game.score += object.value;
      spawnExplosion(game, object.x, object.y, "#fbbf24", 34);
      spawnFloat(game, object.x, object.y, "+MISSILE", "#fbbf24");
      continue;
    }
    if (object.kind === "turret") {
      object.alive = false;
      player.weapon = "turret";
      player.turretActive = false;
      player.weaponAmmo = 14;
      game.score += object.value;
      spawnExplosion(game, object.x, object.y, "#2dd4bf", 34);
      spawnFloat(game, object.x, object.y, "+TURRET", "#2dd4bf");
      continue;
    }
    if (object.kind === "mines") {
      object.alive = false;
      player.mineCount = Math.min(6, player.mineCount + 3);
      game.score += object.value;
      spawnExplosion(game, object.x, object.y, "#fb7185", 34);
      spawnFloat(game, object.x, object.y, "+MINES", "#fb7185");
      continue;
    }
    if (object.kind === "star") {
      object.alive = false;
      game.score += object.value;
      spawnExplosion(game, object.x, object.y, "#fde68a", 46);
      spawnParticles(game, object.x, object.y, "#fde047", 18, 180);
      spawnFloat(game, object.x, object.y, `+${object.value} STAR`, "#fde047");
      continue;
    }

    object.alive = false;
    spawnExplosion(game, object.x, object.y, object.kind === "mine" ? "#fb7185" : "#f97316", 58);
    spawnParticles(game, object.x, object.y, "#fca5a5", 14, 180);
    const damage =
      object.kind === "mine" ? 62 : object.kind === "gunboat" ? 54 : object.kind === "chopper" ? 34 : object.kind === "debris" ? 22 : 42;
    applyDamage(game, damage, "Collision damage sank the boat.");
    player.speed *= 0.72;
  }
}

function collideBanks(game: RuntimeGame, dt: number) {
  const player = game.player;
  const boat = game.boat;
  const channel = riverAt(game.distance + 12);
  const clearance = boat.beam * 0.54;
  const leftLimit = channel.left + clearance;
  const rightLimit = channel.right - clearance;

  if (player.x < leftLimit) {
    const overflow = leftLimit - player.x;
    player.x = leftLimit;
    player.heading += 0.08 + overflow * 0.002;
    player.speed *= 1 - clamp(dt * 0.42, 0, 0.04);
    applyDamage(game, (18 + overflow * 0.45) * dt, "The hull ground out on the left bank.");
  }
  if (player.x > rightLimit) {
    const overflow = player.x - rightLimit;
    player.x = rightLimit;
    player.heading -= 0.08 + overflow * 0.002;
    player.speed *= 1 - clamp(dt * 0.42, 0, 0.04);
    applyDamage(game, (18 + overflow * 0.45) * dt, "The hull ground out on the right bank.");
  }
}

function deployMine(game: RuntimeGame) {
  const player = game.player;
  player.mineCount -= 1;
  const mineY = game.distance - 30;
  const channel = riverAt(mineY);
  game.objects.push({
    id: game.nextId++,
    kind: "mine",
    x: player.x,
    y: mineY,
    vx: 0,
    vy: 0,
    radius: 14,
    health: 2,
    cooldown: 8,
    phase: game.time * 2,
    value: 0,
    alive: true,
    destroyed: false,
    isFriendly: true,
  });
  spawnFloat(game, player.x, mineY, "MINE", "#fb7185");
}

function collideMines(game: RuntimeGame) {
  for (const mine of game.objects) {
    if (!mine.alive || !mine.isFriendly || mine.kind !== "mine") continue;
    mine.cooldown -= 1 / 60;
    if (mine.cooldown <= 0) { mine.alive = false; continue; }
    for (const enemy of game.objects) {
      if (enemy === mine || !enemy.alive || enemy.isFriendly || enemy.kind === "bridge") continue;
      if (Math.hypot(enemy.x - mine.x, enemy.y - mine.y) < enemy.radius + mine.radius + 12) {
        mine.alive = false;
        enemy.alive = false;
        spawnExplosion(game, mine.x, mine.y, "#fb7185", 60);
        spawnParticles(game, mine.x, mine.y, "#fecaca", 20, 200);
        game.shake = Math.max(game.shake, 12);
        addComboKill(game, enemy.x, enemy.y, enemy.value);
        break;
      }
    }
  }
}

function cleanupWorld(game: RuntimeGame) {
  game.bullets = game.bullets.filter((bullet) => bullet.alive);
  game.enemyShots = game.enemyShots.filter((shot) => shot.alive);
  game.objects = game.objects.filter((object) => {
    if (object.kind === "bridge") return object.y > game.distance - 240;
    if (object.isFriendly) return object.alive;
    const stillNear = object.y > game.distance - 260 && object.y < game.distance + GAME_HEIGHT + 720;
    const stillOnMap = object.x > -200 && object.x < GAME_WIDTH + 200;
    return object.alive && stillNear && stillOnMap;
  });
  game.explosions = game.explosions.filter((explosion) => explosion.age < explosion.ttl);
  game.particles = game.particles.filter((particle) => particle.age < particle.ttl);
  game.floats = game.floats.filter((float) => float.age < float.ttl);
}

/* ---------------- Main update ---------------- */

function updateGame(game: RuntimeGame, inputs: Inputs, dt: number) {
  if (game.over) return;
  game.time += dt;
  spawnWorld(game);

  const player = game.player;
  const boat = game.boat;

  if (inputs.turret && player.weapon === "turret") {
    if (game.turretToggle === 0) {
      player.turretActive = !player.turretActive;
      game.turretToggle = 1;
    }
  } else {
    game.turretToggle = 0;
  }

  if (inputs.mine && player.mineCount > 0 && game.mineCooldown <= 0) {
    deployMine(game);
    game.mineCooldown = 0.6;
  }

  const rudderInput = player.turretActive ? 0 : (inputs.right ? 1 : 0) - (inputs.left ? 1 : 0);
  const turretInput = player.turretActive ? (inputs.right ? 1 : 0) - (inputs.left ? 1 : 0) : 0;
  const throttleDelta = (inputs.up ? 0.52 : 0) - (inputs.down ? 0.78 : 0);

  game.throttle = clamp(game.throttle + throttleDelta * dt, game.fuel > 0 ? 0.08 : 0, 1);
  if (game.fuel <= 0) game.throttle = 0;

  const precisionFactor = inputs.precision ? 0.72 : 1;
  const targetSpeed = (22 + game.throttle * (boat.maxSpeed - 22)) * precisionFactor;
  const accelResponse = boat.accel * (inputs.down ? 1.52 : 1);
  player.speed += (targetSpeed - player.speed) * clamp(accelResponse * dt, 0, 1);
  if (inputs.down) player.speed -= 36 * dt;
  player.speed = clamp(player.speed, 10, boat.maxSpeed);

  if (player.turretActive) {
    player.turretAngle += turretInput * 2.6 * dt;
    player.turretAngle = clamp(player.turretAngle, -1.2, 1.2);
    player.rudder *= 0.92;
  } else {
    player.rudder +=
      (rudderInput * precisionFactor - player.rudder) * clamp((3.1 + boat.stats.handling * 0.18) * dt, 0, 1);
  }
  const turnFactor = clamp(player.speed / boat.maxSpeed, 0.22, 1.1);
  player.heading += player.rudder * boat.turnRate * turnFactor * dt;
  player.heading -= player.heading * (0.56 + boat.stability * 0.13) * dt;
  player.heading = clamp(player.heading, -0.63, 0.63);

  const drift = Math.sin(game.distance * 0.011 + game.time * 0.7) * (6 + Math.sin(game.distance * 0.004) * 4);
  const current =
    Math.sin(game.distance * 0.007 + game.time * 1.35) * (16 - boat.stability * 1.8) +
    Math.sin(game.distance * 0.018 + 1.4) * 4 + drift;
  const lateralSpeed = Math.sin(player.heading) * player.speed * 0.94 + current;
  player.x += lateralSpeed * dt;
  game.distance += player.speed * dt;
  game.score += player.speed * dt * 0.42;
  game.fuel -= (0.34 + game.throttle * 0.9 + (player.speed / boat.maxSpeed) * 0.54) * boat.fuelBurn * dt;

  player.cooldown = Math.max(0, player.cooldown - dt);
  player.scrape = Math.max(0, player.scrape - dt);
  player.shield = Math.max(0, player.shield - dt * 0.08);
  game.mineCooldown = Math.max(0, game.mineCooldown - dt);
  if (player.rapidTimer > 0) {
    player.rapidTimer -= dt;
    if (player.rapidTimer <= 0 && player.weapon === "rapid") player.weapon = "cannon";
  }

  const fireRate = player.weapon === "rapid" || player.rapidTimer > 0 ? boat.cooldown * 0.45 : boat.cooldown;
  if (inputs.fire && player.cooldown <= 0) {
    firePlayer(game);
    player.cooldown = fireRate;
  }

  game.comboTimer -= dt;
  if (game.comboTimer <= 0) game.combo = 0;
  game.shake = Math.max(0, game.shake - dt * 44);
  game.flash = Math.max(0, game.flash - dt * 1.2);
  game.tier = tierFor(game.distance).id;

  updateBullets(game, dt);
  updateObjects(game, dt);
  collideBullets(game);
  collidePlayer(game);
  collideBanks(game, dt);
  collideMines(game);

  if (game.distance >= game.nextEventY) {
    const eventRoll = seededRandom(game);
    if (eventRoll < 0.25) {
      spawnFloat(game, GAME_WIDTH / 2, game.distance + 200, "WATERFALL SPEED BOOST", "#22f2ff");
      player.speed *= 1.4;
      game.shake = Math.max(game.shake, 20);
    } else if (eventRoll < 0.5) {
      spawnFloat(game, GAME_WIDTH / 2, game.distance + 200, "CANYON PASSAGE +BONUS", "#fde047");
      game.score += 500 + game.tier * 100;
    } else if (eventRoll < 0.75) {
      spawnFloat(game, GAME_WIDTH / 2, game.distance + 200, "WHIRLPOOL ESCAPE", "#f97316");
      player.heading += (seededRandom(game) - 0.5) * 0.8;
      game.shake = Math.max(game.shake, 16);
    } else {
      spawnFloat(game, GAME_WIDTH / 2, game.distance + 200, "SUPPLY DROP", "#86efac");
      game.fuel = clamp(game.fuel + 20, 0, 100);
      game.hull = Math.min(game.maxHull, game.hull + 25);
    }
    game.nextEventY += 1800 + seededRandom(game) * 700;
  }

  for (const explosion of game.explosions) explosion.age += dt;
  for (const particle of game.particles) {
    particle.age += dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 0.92;
    particle.vy *= 0.92;
  }
  for (const float of game.floats) float.age += dt;

  if (game.fuel <= 0 && !game.over) {
    game.fuel = 0;
    game.over = true;
    game.message = "Fuel ran dry before the next supply barge.";
  }
  cleanupWorld(game);
}

/* =====================================================================
 *  RENDERING
 * ==================================================================== */

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#3f2f19";
  ctx.fillRect(-2, 6, 4, 12);
  ctx.fillStyle = "#14532d";
  ctx.beginPath();
  ctx.moveTo(0, -14);
  ctx.lineTo(-14, 8);
  ctx.lineTo(14, 8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(34, 197, 94, 0.35)";
  ctx.beginPath();
  ctx.arc(-4, -2, 7, 0, TWO_PI);
  ctx.arc(5, 2, 8, 0, TWO_PI);
  ctx.fill();
  ctx.restore();
}

function drawRiver(ctx: CanvasRenderingContext2D, game: RuntimeGame, phase: Phase, time: number) {
  const leftPoints: Array<{ x: number; y: number }> = [];
  const rightPoints: Array<{ x: number; y: number }> = [];

  const bankGradient = ctx.createLinearGradient(0, 0, GAME_WIDTH, GAME_HEIGHT);
  bankGradient.addColorStop(0, "#17351f");
  bankGradient.addColorStop(0.5, "#24451f");
  bankGradient.addColorStop(1, "#122f26");
  ctx.fillStyle = bankGradient;
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  for (let y = -48; y <= GAME_HEIGHT + 48; y += 10) {
    const worldY = game.distance + (PLAYER_SCREEN_Y - y);
    const river = riverAt(worldY);
    leftPoints.push({ x: river.left, y });
    rightPoints.push({ x: river.right, y });
  }

  const waterGradient = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
  waterGradient.addColorStop(0, "#0f6f92");
  waterGradient.addColorStop(0.45, "#0a5f82");
  waterGradient.addColorStop(1, "#083957");
  ctx.beginPath();
  ctx.moveTo(leftPoints[0].x, leftPoints[0].y);
  for (const p of leftPoints) ctx.lineTo(p.x, p.y);
  for (let i = rightPoints.length - 1; i >= 0; i -= 1) {
    const p = rightPoints[i];
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.fillStyle = waterGradient;
  ctx.fill();

  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(202, 138, 4, 0.42)";
  ctx.beginPath();
  for (const p of leftPoints) ctx.lineTo(p.x, p.y);
  ctx.stroke();
  ctx.beginPath();
  for (const p of rightPoints) ctx.lineTo(p.x, p.y);
  ctx.stroke();

  const narrow = phase === "playing" && riverAt(game.distance).narrowness > 0.6;
  ctx.lineWidth = narrow ? 3 : 2;
  ctx.strokeStyle = narrow ? "rgba(250, 204, 21, 0.8)" : "rgba(186, 230, 253, 0.28)";
  ctx.beginPath();
  for (const p of leftPoints) ctx.lineTo(p.x + 5, p.y);
  ctx.stroke();
  ctx.beginPath();
  for (const p of rightPoints) ctx.lineTo(p.x - 5, p.y);
  ctx.stroke();

  for (let i = 0; i < 14; i += 1) {
    const waveY = ((i * 92 + game.distance * 0.64 + time * 22) % (GAME_HEIGHT + 120)) - 62;
    const worldY = game.distance + (PLAYER_SCREEN_Y - waveY);
    const river = riverAt(worldY);
    const lane = river.left + river.width * (0.22 + pseudo(i * 19.4 + Math.floor(worldY / 210)) * 0.56);
    const sway = Math.sin(time * 1.7 + i) * 15;
    ctx.beginPath();
    ctx.moveTo(lane - 28 + sway, waveY);
    ctx.bezierCurveTo(lane - 10, waveY + 8, lane + 14, waveY - 8, lane + 38 + sway, waveY + 2);
    ctx.strokeStyle = "rgba(224, 242, 254, 0.23)";
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  for (let i = -2; i < 16; i += 1) {
    const treeWorld = Math.floor((game.distance - 260) / 86 + i) * 86;
    const y = screenY(game, treeWorld);
    const river = riverAt(treeWorld);
    const leftNoise = pseudo(treeWorld * 0.07);
    const rightNoise = pseudo(treeWorld * 0.11 + 15);
    if (leftNoise > 0.22) drawTree(ctx, river.left - 22 - leftNoise * 42, y + leftNoise * 14, 0.72 + leftNoise * 0.42);
    if (rightNoise > 0.22) drawTree(ctx, river.right + 22 + rightNoise * 42, y - rightNoise * 12, 0.72 + rightNoise * 0.42);
  }

  const tier = tierFor(game.distance);
  if (tier.id >= 7) {
    const intensity = clamp((tier.id - 6) * 0.08, 0, 0.3);
    ctx.fillStyle = `rgba(30, 15, 40, ${intensity})`;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  }
}

/* ---------------- Enemy & pickup rendering ---------------- */

function drawBridge(ctx: CanvasRenderingContext2D, game: RuntimeGame, bridge: WorldObject) {
  const y = screenY(game, bridge.y);
  const river = riverAt(bridge.y);
  const left = river.left - 20;
  const right = river.right + 20;
  const gap = bridge.destroyed ? 92 : 0;

  ctx.save();
  ctx.translate(0, y);
  ctx.lineWidth = 3;

  if (bridge.destroyed) {
    ctx.fillStyle = "#2b1b14";
    roundedRect(ctx, left, -17, river.width * 0.5 - gap * 0.52, 34, 5);
    ctx.fill();
    roundedRect(ctx, river.center + gap * 0.52, -17, river.width * 0.5 - gap * 0.52, 34, 5);
    ctx.fill();
    ctx.strokeStyle = "rgba(251, 146, 60, 0.55)";
    ctx.beginPath();
    ctx.moveTo(river.center - gap * 0.55, -16);
    ctx.lineTo(river.center - gap * 0.3, 12);
    ctx.moveTo(river.center + gap * 0.55, -16);
    ctx.lineTo(river.center + gap * 0.28, 14);
    ctx.stroke();
  } else {
    ctx.fillStyle = "#76523b";
    roundedRect(ctx, left, -18, right - left, 36, 6);
    ctx.fill();
    ctx.strokeStyle = "rgba(254, 243, 199, 0.35)";
    ctx.beginPath();
    for (let x = left + 18; x < right - 18; x += 42) {
      ctx.moveTo(x, -16);
      ctx.lineTo(x + 34, 16);
      ctx.moveTo(x + 34, -16);
      ctx.lineTo(x, 16);
    }
    ctx.stroke();
    ctx.fillStyle = "#991b1b";
    roundedRect(ctx, river.center - 34, -23, 68, 46, 10);
    ctx.fill();
    ctx.fillStyle = "#fecaca";
    ctx.font = "700 16px ui-sans-serif, system-ui";
    ctx.textAlign = "center";
    ctx.fillText("TARGET", river.center, 5);
    for (let i = 0; i < bridge.health; i += 1) {
      ctx.fillStyle = "#fde047";
      ctx.fillRect(river.center - 28 + i * 12, 26, 8, 5);
    }
  }
  ctx.restore();
}

function drawMine(ctx: CanvasRenderingContext2D, object: WorldObject, y: number, time: number) {
  ctx.save();
  ctx.translate(object.x, y);
  ctx.rotate(time * 0.8 + object.phase);
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 4;
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * TWO_PI;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 11, Math.sin(a) * 11);
    ctx.lineTo(Math.cos(a) * 22, Math.sin(a) * 22);
    ctx.stroke();
  }
  ctx.fillStyle = "#111827";
  ctx.beginPath();
  ctx.arc(0, 0, 15, 0, TWO_PI);
  ctx.fill();
  ctx.fillStyle = "#fb7185";
  ctx.beginPath();
  ctx.arc(0, -2, 4.5, 0, TWO_PI);
  ctx.fill();
  ctx.restore();
}

function drawFriendlyMine(ctx: CanvasRenderingContext2D, object: WorldObject, y: number, time: number) {
  ctx.save();
  ctx.translate(object.x, y);
  const bob = Math.sin(time * 3 + object.phase) * 4;
  ctx.translate(0, bob);
  ctx.fillStyle = "rgba(251, 113, 133, 0.25)";
  ctx.beginPath();
  ctx.arc(0, 6, 18, 0, TWO_PI);
  ctx.fill();
  ctx.fillStyle = "#fb7185";
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, TWO_PI);
  ctx.fill();
  ctx.fillStyle = "#fff1f2";
  ctx.font = "700 10px ui-sans-serif, system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("M", 0, 0);
  ctx.restore();
}

function drawDebris(ctx: CanvasRenderingContext2D, object: WorldObject, y: number, time: number) {
  ctx.save();
  ctx.translate(object.x, y);
  ctx.rotate(time * 1.5 + object.phase);
  ctx.fillStyle = "#5c3d2e";
  roundedRect(ctx, -16, -5, 32, 10, 4);
  ctx.fill();
  ctx.fillStyle = "#3d261a";
  roundedRect(ctx, -2, -6, 4, 12, 2);
  ctx.fill();
  ctx.fillStyle = "rgba(101, 67, 33, 0.5)";
  ctx.fillRect(-8, -2, 16, 4);
  ctx.restore();
}

function drawPickup(ctx: CanvasRenderingContext2D, object: WorldObject, y: number, time: number) {
  ctx.save();
  ctx.translate(object.x, y);
  const bob = Math.sin(time * 2 + object.phase) * 3;
  ctx.translate(0, bob);
  ctx.rotate(Math.sin(time * 1.4 + object.phase) * 0.12);

  const pulse = 0.6 + Math.sin(time * 4 + object.phase) * 0.35;
  const glowSize = 30 + pulse * 8;
  const glowColor =
    object.kind === "fuel" ? "rgba(250, 204, 21, 0.28)" :
    object.kind === "repair" ? "rgba(134, 239, 172, 0.32)" :
    object.kind === "shield" ? "rgba(147, 197, 253, 0.36)" :
    object.kind === "rapid" ? "rgba(252, 165, 165, 0.34)" :
    object.kind === "spread" ? "rgba(196, 181, 253, 0.34)" :
    object.kind === "spread" ? "rgba(196, 181, 253, 0.34)" :
    object.kind === "missile" ? "rgba(251, 191, 36, 0.36)" :
    object.kind === "turret" ? "rgba(45, 212, 191, 0.34)" :
    object.kind === "mines" ? "rgba(251, 113, 133, 0.34)" :
    "rgba(253, 224, 71, 0.42)";
  const grad = ctx.createRadialGradient(0, 0, 4, 0, 0, glowSize);
  grad.addColorStop(0, glowColor);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, glowSize, 0, TWO_PI);
  ctx.fill();

  if (object.kind === "fuel") {
    ctx.fillStyle = "#eab308";
    roundedRect(ctx, -18, -24, 36, 48, 9);
    ctx.fill();
    ctx.fillStyle = "#fef3c7";
    ctx.fillRect(-18, -5, 36, 10);
    ctx.fillStyle = "#78350f";
    ctx.font = "700 12px ui-sans-serif, system-ui";
    ctx.textAlign = "center";
    ctx.fillText("FUEL", 0, 5);
    ctx.strokeStyle = "rgba(254, 240, 138, 0.6)";
    ctx.lineWidth = 2;
    ctx.strokeRect(-15, -20, 30, 40);
  } else if (object.kind === "repair") {
    ctx.fillStyle = "#16a34a";
    roundedRect(ctx, -19, -19, 38, 38, 10);
    ctx.fill();
    ctx.fillStyle = "#f0fdf4";
    ctx.fillRect(-14, -4, 28, 8);
    ctx.fillRect(-4, -14, 8, 28);
  } else if (object.kind === "shield") {
    ctx.fillStyle = "#3b82f6";
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.quadraticCurveTo(20, -14, 20, 6);
    ctx.quadraticCurveTo(20, 22, 0, 26);
    ctx.quadraticCurveTo(-20, 22, -20, 6);
    ctx.quadraticCurveTo(-20, -14, 0, -22);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#dbeafe";
    ctx.lineWidth = 2;
    ctx.stroke();
  } else if (object.kind === "rapid") {
    ctx.fillStyle = "#dc2626";
    roundedRect(ctx, -18, -18, 36, 36, 10);
    ctx.fill();
    ctx.fillStyle = "#fee2e2";
    ctx.font = "700 14px ui-sans-serif, system-ui";
    ctx.textAlign = "center";
    ctx.fillText("R", 0, 5);
  } else if (object.kind === "spread") {
    ctx.fillStyle = "#7c3aed";
    roundedRect(ctx, -18, -18, 36, 36, 10);
    ctx.fill();
    ctx.fillStyle = "#ede9fe";
    ctx.font = "700 14px ui-sans-serif, system-ui";
    ctx.textAlign = "center";
    ctx.fillText("S", 0, 5);
  } else if (object.kind === "missile") {
    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.lineTo(14, 6);
    ctx.lineTo(10, 22);
    ctx.lineTo(-10, 22);
    ctx.lineTo(-14, 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#fef3c7";
    ctx.fillRect(-3, -4, 6, 10);
  } else if (object.kind === "turret") {
    ctx.fillStyle = "#0d9488";
    roundedRect(ctx, -18, -18, 36, 36, 10);
    ctx.fill();
    ctx.fillStyle = "#ccfbf1";
    ctx.font = "700 14px ui-sans-serif, system-ui";
    ctx.textAlign = "center";
    ctx.fillText("T", 0, 5);
  } else if (object.kind === "mines") {
    ctx.fillStyle = "#e11d48";
    roundedRect(ctx, -18, -18, 36, 36, 10);
    ctx.fill();
    ctx.fillStyle = "#ffe4e6";
    ctx.font = "700 14px ui-sans-serif, system-ui";
    ctx.textAlign = "center";
    ctx.fillText("M", 0, 5);
  } else {
    ctx.fillStyle = "#fde047";
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * TWO_PI - Math.PI / 2;
      const r = i % 2 === 0 ? 20 : 9;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#78350f";
    ctx.font = "700 12px ui-sans-serif, system-ui";
    ctx.textAlign = "center";
    ctx.fillText("★", 0, 4);
  }
  ctx.restore();
}

function drawEnemyBoat(ctx: CanvasRenderingContext2D, object: WorldObject, y: number, kind: "patrol" | "raider") {
  const isRaider = kind === "raider";
  ctx.save();
  ctx.translate(object.x, y);
  ctx.rotate(isRaider ? Math.sin(object.phase) * 0.08 : 0);
  ctx.fillStyle = isRaider ? "#7f1d1d" : "#1e293b";
  ctx.beginPath();
  ctx.moveTo(0, -25);
  ctx.quadraticCurveTo(22, -12, 19, 22);
  ctx.quadraticCurveTo(0, 31, -19, 22);
  ctx.quadraticCurveTo(-22, -12, 0, -25);
  ctx.fill();
  ctx.fillStyle = isRaider ? "#fecaca" : "#cbd5e1";
  roundedRect(ctx, -9, -8, 18, 22, 4);
  ctx.fill();
  ctx.strokeStyle = "#facc15";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -16);
  ctx.lineTo(0, -32);
  ctx.stroke();
  ctx.restore();
}

function drawChopper(ctx: CanvasRenderingContext2D, object: WorldObject, y: number, time: number) {
  ctx.save();
  ctx.translate(object.x, y);
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(6, 26, 30, 10, 0, 0, TWO_PI);
  ctx.fill();
  ctx.fillStyle = "#27272a";
  roundedRect(ctx, -20, -8, 40, 17, 8);
  ctx.fill();
  ctx.fillStyle = "#94a3b8";
  roundedRect(ctx, -7, -16, 16, 12, 4);
  ctx.fill();
  ctx.strokeStyle = "rgba(226, 232, 240, 0.75)";
  ctx.lineWidth = 2;
  ctx.save();
  ctx.rotate(time * 22 + object.phase);
  ctx.beginPath();
  ctx.moveTo(-35, 0);
  ctx.lineTo(35, 0);
  ctx.moveTo(0, -35);
  ctx.lineTo(0, 35);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = "#27272a";
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(37, -8);
  ctx.stroke();
  ctx.restore();
}

function drawJet(ctx: CanvasRenderingContext2D, object: WorldObject, y: number, time: number) {
  ctx.save();
  ctx.translate(object.x, y);
  const direction = object.vx >= 0 ? 1 : -1;
  ctx.scale(direction, 1);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(8, 24, 28, 8, 0, 0, TWO_PI);
  ctx.fill();
  ctx.fillStyle = "#6b7280";
  ctx.beginPath();
  ctx.moveTo(26, 0);
  ctx.lineTo(-18, -14);
  ctx.lineTo(-24, -6);
  ctx.lineTo(-6, 0);
  ctx.lineTo(-24, 6);
  ctx.lineTo(-18, 14);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#fde68a";
  ctx.beginPath();
  ctx.arc(22, 0, 3, 0, TWO_PI);
  ctx.fill();
  ctx.fillStyle = "rgba(251, 191, 36, 0.65)";
  ctx.beginPath();
  ctx.moveTo(-24, 0);
  ctx.lineTo(-44 - Math.sin(time * 30) * 4, -6);
  ctx.lineTo(-44 - Math.sin(time * 30) * 4, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawSubmarine(ctx: CanvasRenderingContext2D, object: WorldObject, y: number, time: number) {
  ctx.save();
  ctx.translate(object.x, y);
  if (object.submerged) {
    ctx.globalAlpha = 0.42;
    ctx.strokeStyle = "rgba(226, 232, 240, 0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 4, 24, 10, 0, 0, TWO_PI);
    ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.fillStyle = "#0f172a";
  roundedRect(ctx, -30, -10, 60, 20, 10);
  ctx.fill();
  ctx.fillStyle = "#334155";
  roundedRect(ctx, -6, -20, 12, 12, 3);
  ctx.fill();
  ctx.fillStyle = "#fde68a";
  ctx.beginPath();
  ctx.arc(0, -14, 2.5, 0, TWO_PI);
  ctx.fill();
  ctx.strokeStyle = "rgba(226, 232, 240, 0.4)";
  ctx.lineWidth = 2;
  const wobble = Math.sin(time * 6) * 2;
  ctx.beginPath();
  ctx.moveTo(-32, 8);
  ctx.bezierCurveTo(-12, 14 + wobble, 12, 14 - wobble, 32, 8);
  ctx.stroke();
  ctx.restore();
}

function drawGunboat(ctx: CanvasRenderingContext2D, object: WorldObject, y: number) {
  ctx.save();
  ctx.translate(object.x, y);
  ctx.fillStyle = "#1f2937";
  ctx.beginPath();
  ctx.moveTo(0, -36);
  ctx.quadraticCurveTo(30, -16, 26, 28);
  ctx.quadraticCurveTo(0, 38, -26, 28);
  ctx.quadraticCurveTo(-30, -16, 0, -36);
  ctx.fill();
  ctx.fillStyle = "#4b5563";
  roundedRect(ctx, -14, -10, 28, 32, 6);
  ctx.fill();
  ctx.fillStyle = "#9ca3af";
  roundedRect(ctx, -4, -22, 8, 14, 2);
  ctx.fill();
  ctx.fillStyle = "#facc15";
  ctx.fillRect(-2, -22, 4, 8);
  ctx.restore();
}

/* ---------------- Projectiles & effects ---------------- */

function drawProjectiles(ctx: CanvasRenderingContext2D, game: RuntimeGame, time: number) {
  for (const bullet of game.bullets) {
    const y = screenY(game, bullet.y);
    if (bullet.trail && bullet.trail.length > 1) {
      ctx.strokeStyle = "rgba(251, 191, 36, 0.55)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < bullet.trail.length; i += 1) {
        const pt = bullet.trail[i];
        const py = screenY(game, pt.y);
        if (i === 0) ctx.moveTo(pt.x, py);
        else ctx.lineTo(pt.x, py);
      }
      ctx.stroke();
    }

    if (bullet.kind === "turret") {
      ctx.strokeStyle = "rgba(45, 212, 191, 0.85)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(bullet.x, y + 6);
      ctx.lineTo(bullet.x, y - 12);
      ctx.stroke();
      ctx.fillStyle = "#2dd4bf";
      ctx.beginPath();
      ctx.arc(bullet.x, y - 14, 3.5, 0, TWO_PI);
      ctx.fill();
    } else if (bullet.kind === "spread") {
      ctx.strokeStyle = "rgba(196, 181, 253, 0.85)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(bullet.x, y + 8);
      ctx.lineTo(bullet.x, y - 10);
      ctx.stroke();
      ctx.fillStyle = "#c4b5fd";
      ctx.beginPath();
      ctx.arc(bullet.x, y - 11, 2.5, 0, TWO_PI);
      ctx.fill();
    } else if (bullet.kind === "missile") {
      ctx.save();
      ctx.translate(bullet.x, y);
      ctx.rotate(Math.atan2(-bullet.vy, -bullet.vx) + Math.PI / 2);
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(5, 8);
      ctx.lineTo(-5, 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(251, 146, 60, 0.75)";
      ctx.beginPath();
      ctx.arc(0, 11, 3 + Math.sin(time * 26) * 1.2, 0, TWO_PI);
      ctx.fill();
      ctx.restore();
    } else if (bullet.kind === "rapid") {
      ctx.strokeStyle = "rgba(252, 165, 165, 0.82)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(bullet.x, y + 7);
      ctx.lineTo(bullet.x, y - 8);
      ctx.stroke();
    } else {
      ctx.strokeStyle = "rgba(254, 249, 195, 0.72)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(bullet.x, y + 10);
      ctx.lineTo(bullet.x, y - 11);
      ctx.stroke();
      ctx.fillStyle = "#fef08a";
      ctx.beginPath();
      ctx.arc(bullet.x, y - 12, 3, 0, TWO_PI);
      ctx.fill();
    }
  }

  for (const shot of game.enemyShots) {
    const y = screenY(game, shot.y);
    if (shot.kind === "torpedo") {
      ctx.fillStyle = "#64748b";
      roundedRect(ctx, shot.x - 5, y - 14, 10, 28, 5);
      ctx.fill();
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(shot.x - 2, y - 10, 4, 6);
      ctx.strokeStyle = "rgba(226, 232, 240, 0.42)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(shot.x - 8, y + 12);
      ctx.bezierCurveTo(shot.x - 14, y + 20, shot.x + 14, y + 20, shot.x + 8, y + 12);
      ctx.stroke();
    } else if (shot.kind === "missile") {
      ctx.save();
      ctx.translate(shot.x, y);
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.moveTo(0, 8);
      ctx.lineTo(-5, -6);
      ctx.lineTo(5, -6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(251, 146, 60, 0.7)";
      ctx.beginPath();
      ctx.arc(0, -9, 2.5 + Math.sin(time * 24) * 1.1, 0, TWO_PI);
      ctx.fill();
      ctx.restore();
    } else {
      ctx.strokeStyle = "rgba(248, 113, 113, 0.52)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(shot.x, y - 8);
      ctx.lineTo(shot.x, y + 10);
      ctx.stroke();
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      ctx.arc(shot.x, y + 10, 4, 0, TWO_PI);
      ctx.fill();
    }
  }
}

function drawExplosions(ctx: CanvasRenderingContext2D, game: RuntimeGame) {
  for (const explosion of game.explosions) {
    const progress = clamp(explosion.age / explosion.ttl, 0, 1);
    const y = screenY(game, explosion.y);
    ctx.save();
    ctx.globalAlpha = 1 - progress;
    ctx.fillStyle = explosion.color;
    ctx.beginPath();
    ctx.arc(explosion.x, y, explosion.size * (0.35 + progress), 0, TWO_PI);
    ctx.fill();
    ctx.globalAlpha = (1 - progress) * 0.55;
    ctx.strokeStyle = "#fff7ed";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(explosion.x, y, explosion.size * (0.62 + progress * 0.82), 0, TWO_PI);
    ctx.stroke();
    if (explosion.size > 50) {
      ctx.globalAlpha = (1 - progress) * 0.2;
      ctx.strokeStyle = explosion.color;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(explosion.x, y, explosion.size * (1.2 + progress * 1.5), 0, TWO_PI);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, game: RuntimeGame) {
  for (const particle of game.particles) {
    const progress = clamp(particle.age / particle.ttl, 0, 1);
    const y = screenY(game, particle.y);
    ctx.save();
    ctx.globalAlpha = particle.fade ? 1 - progress : 1;
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, y, Math.max(0.3, particle.size * (1 - progress * 0.6)), 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }
}

function drawFloats(ctx: CanvasRenderingContext2D, game: RuntimeGame) {
  for (const float of game.floats) {
    const progress = clamp(float.age / float.ttl, 0, 1);
    const y = screenY(game, float.y) - progress * 34;
    ctx.save();
    ctx.globalAlpha = 1 - progress * 0.8;
    ctx.fillStyle = float.color;
    ctx.font = "700 14px ui-sans-serif, system-ui";
    ctx.textAlign = "center";
    ctx.strokeStyle = "rgba(2, 6, 23, 0.7)";
    ctx.lineWidth = 3;
    ctx.strokeText(float.text, float.x, y);
    ctx.fillText(float.text, float.x, y);
    ctx.restore();
  }
}

function drawObjects(ctx: CanvasRenderingContext2D, game: RuntimeGame, time: number) {
  for (const object of game.objects) {
    const y = screenY(game, object.y);
    if (y < -90 || y > GAME_HEIGHT + 90) continue;
    if (object.kind === "bridge") drawBridge(ctx, game, object);
    else if (object.kind === "mine" && !object.isFriendly) drawMine(ctx, object, y, time);
    else if (object.isFriendly && object.kind === "mine") drawFriendlyMine(ctx, object, y, time);
    else if (object.kind === "fuel" || object.kind === "repair" || object.kind === "shield" || object.kind === "rapid" || object.kind === "spread" || object.kind === "missile" || object.kind === "turret" || object.kind === "mines" || object.kind === "star")
      drawPickup(ctx, object, y, time);
    else if (object.kind === "debris") drawDebris(ctx, object, y, time);
    else if (object.kind === "patrol") drawEnemyBoat(ctx, object, y, "patrol");
    else if (object.kind === "raider") drawEnemyBoat(ctx, object, y, "raider");
    else if (object.kind === "chopper") drawChopper(ctx, object, y, time);
    else if (object.kind === "jet") drawJet(ctx, object, y, time);
    else if (object.kind === "submarine") drawSubmarine(ctx, object, y, time);
    else if (object.kind === "gunboat") drawGunboat(ctx, object, y);
  }
}

function drawPlayer(ctx: CanvasRenderingContext2D, game: RuntimeGame, time: number) {
  const { boat, player } = game;
  const wakeLength = 54 + player.speed * 0.18;

  ctx.save();
  ctx.translate(player.x, PLAYER_SCREEN_Y);
  ctx.rotate(player.heading);

  for (let i = 0; i < 5; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const offset = side * (boat.beam * 0.22 + i * 2.8);
    const wobble = Math.sin(time * 8 + i) * 4;
    ctx.strokeStyle = boat.wakeColor;
    ctx.lineWidth = 2.5 - i * 0.22;
    ctx.beginPath();
    ctx.moveTo(offset, boat.length * 0.36);
    ctx.quadraticCurveTo(offset + side * 11 + wobble, boat.length * 0.65 + wakeLength * 0.32, offset + side * 22, boat.length * 0.45 + wakeLength);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(15, 23, 42, 0.28)";
  ctx.beginPath();
  ctx.ellipse(0, 7, boat.beam * 0.82, boat.length * 0.58, 0, 0, TWO_PI);
  ctx.fill();

  ctx.fillStyle = boat.hullColor;
  ctx.beginPath();
  ctx.moveTo(0, -boat.length * 0.53);
  ctx.quadraticCurveTo(boat.beam * 0.55, -boat.length * 0.2, boat.beam * 0.43, boat.length * 0.42);
  ctx.quadraticCurveTo(0, boat.length * 0.58, -boat.beam * 0.43, boat.length * 0.42);
  ctx.quadraticCurveTo(-boat.beam * 0.55, -boat.length * 0.2, 0, -boat.length * 0.53);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = boat.deckColor;
  roundedRect(ctx, -boat.beam * 0.25, -boat.length * 0.11, boat.beam * 0.5, boat.length * 0.34, 6);
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.68)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -boat.length * 0.48);
  ctx.lineTo(0, -boat.length * 0.72);
  ctx.stroke();

  ctx.fillStyle = "rgba(15, 23, 42, 0.78)";
  ctx.fillRect(-boat.beam * 0.18, -boat.length * 0.02, boat.beam * 0.36, 5);

  if (player.weapon === "turret") {
    ctx.save();
    ctx.rotate(player.turretAngle);
    ctx.fillStyle = "#5eead4";
    roundedRect(ctx, -4, -boat.length * 0.22, 8, boat.length * 0.18, 3);
    ctx.fill();
    ctx.fillStyle = "#2dd4bf";
    ctx.fillRect(-2, -boat.length * 0.26, 4, 8);
    ctx.restore();
  }

  if (player.hull < game.maxHull * 0.4) {
    const smokeIntensity = 1 - player.hull / (game.maxHull * 0.4);
    ctx.fillStyle = `rgba(100, 100, 100, ${smokeIntensity * 0.3})`;
    const sway = Math.sin(time * 12) * 6;
    ctx.beginPath();
    ctx.arc(sway - 6, boat.length * 0.2, 8 + smokeIntensity * 8, 0, TWO_PI);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sway + 8, boat.length * 0.3, 6 + smokeIntensity * 6, 0, TWO_PI);
    ctx.fill();
  }

  if (player.shield > 0) {
    const pulse = 0.6 + Math.sin(time * 6) * 0.25;
    ctx.strokeStyle = `rgba(147, 197, 253, ${pulse})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, 0, boat.beam * 0.82, boat.length * 0.7, 0, 0, TWO_PI);
    ctx.stroke();
    ctx.strokeStyle = `rgba(219, 234, 254, ${pulse * 0.6})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, boat.beam * 0.9, boat.length * 0.76, 0, 0, TWO_PI);
    ctx.stroke();
  }

  if (player.scrape > 0) {
    ctx.strokeStyle = `rgba(248, 113, 113, ${clamp(player.scrape * 2.8, 0, 0.7)})`;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(0, 0, boat.beam * 0.72, boat.length * 0.62, 0, 0, TWO_PI);
    ctx.stroke();
  }

  ctx.restore();
}

function drawOverlay(ctx: CanvasRenderingContext2D, game: RuntimeGame) {
  const river = riverAt(game.distance + 16);
  ctx.save();
  const vignette = ctx.createRadialGradient(
    GAME_WIDTH / 2,
    GAME_HEIGHT * 0.45,
    90,
    GAME_WIDTH / 2,
    GAME_HEIGHT * 0.45,
    GAME_HEIGHT * 0.72,
  );
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(2, 6, 23, 0.34)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  ctx.strokeStyle = "rgba(226, 232, 240, 0.16)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(GAME_WIDTH / 2 - 22, 38);
  ctx.lineTo(GAME_WIDTH / 2 + 22, 38);
  ctx.moveTo(GAME_WIDTH / 2, 26);
  ctx.lineTo(GAME_WIDTH / 2, 50);
  ctx.stroke();

  if (river.narrowness > 0.35) {
    ctx.fillStyle = `rgba(250, 204, 21, ${0.08 + river.narrowness * 0.13})`;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  }

  if (game.flash > 0) {
    ctx.fillStyle = `rgba(239, 68, 68, ${clamp(game.flash * 0.5, 0, 0.35)})`;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  }

  ctx.restore();
}

function drawGame(ctx: CanvasRenderingContext2D, game: RuntimeGame, phase: Phase, time: number) {
  ctx.save();
  if (game.shake > 0) {
    const sx = (pseudo(time * 50) - 0.5) * game.shake;
    const sy = (pseudo(time * 50 + 7) - 0.5) * game.shake;
    ctx.translate(sx, sy);
  }
  drawRiver(ctx, game, phase, time);
  drawObjects(ctx, game, time);
  drawProjectiles(ctx, game, time);
  drawExplosions(ctx, game);
  drawParticles(ctx, game);
  drawPlayer(ctx, game, time);
  drawFloats(ctx, game);
  drawOverlay(ctx, game);
  ctx.restore();
}

function drawMenuBackground(ctx: CanvasRenderingContext2D, time: number) {
  const gradient = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
  gradient.addColorStop(0, "#021a2a");
  gradient.addColorStop(0.5, "#042f44");
  gradient.addColorStop(1, "#061f2a");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  for (let i = 0; i < 20; i++) {
    const waveY = ((i * 48 + time * 18) % (GAME_HEIGHT + 60)) - 30;
    const waveX = Math.sin(time * 0.7 + i * 0.5) * 30 + GAME_WIDTH / 2;
    ctx.strokeStyle = `rgba(34, 242, 255, ${0.04 + Math.sin(time + i) * 0.02})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(waveX - 40, waveY);
    ctx.quadraticCurveTo(waveX, waveY - 12, waveX + 50, waveY + 4);
    ctx.stroke();
  }

  const cx = GAME_WIDTH / 2;
  const cy = GAME_HEIGHT * 0.32;
  ctx.save();
  ctx.translate(cx, cy);
  const pulse = 0.8 + Math.sin(time * 0.8) * 0.2;
  ctx.globalAlpha = pulse;

  ctx.fillStyle = "#22f2ff";
  ctx.font = "700 48px ui-sans-serif, system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(34, 242, 255, 0.6)";
  ctx.shadowBlur = 30;
  ctx.fillText("TIDAL RUN", 0, 0);
  ctx.shadowBlur = 0;

  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.font = "400 14px ui-sans-serif, system-ui";
  ctx.fillText("RIVER RAID", 0, 44);

  ctx.restore();

  const scrollY = (time * 28) % (GAME_HEIGHT + 100);
  for (let i = 0; i < 6; i++) {
    const y = scrollY + i * (GAME_HEIGHT + 100) / 6 - 50;
    const x = GAME_WIDTH * (0.15 + pseudo(i * 7.3 + Math.floor(time * 0.2)) * 0.7);
    ctx.fillStyle = `rgba(34, 242, 255, ${0.06 + pseudo(i * 3.1 + time * 0.1) * 0.04})`;
    ctx.font = "700 16px ui-sans-serif, system-ui";
    ctx.textAlign = "center";
    ctx.fillText("~", x, y);
  }
}

/* =====================================================================
 *  CANVAS PREPARATION + INPUT MAPPING
 * ==================================================================== */

function prepareCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.floor(GAME_WIDTH * dpr);
  const height = Math.floor(GAME_HEIGHT * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function mapKeyToInput(code: string): keyof Inputs | null {
  if (code === "ArrowLeft" || code === "KeyA") return "left";
  if (code === "ArrowRight" || code === "KeyD") return "right";
  if (code === "ArrowUp" || code === "KeyW") return "up";
  if (code === "ArrowDown" || code === "KeyS") return "down";
  if (code === "Space") return "fire";
  if (code === "ShiftLeft" || code === "ShiftRight") return "precision";
  if (code === "KeyQ") return "turret";
  if (code === "KeyE") return "mine";
  return null;
}

/* =====================================================================
 *  UI COMPONENTS
 * ==================================================================== */

function Meter({ label, value, tone, warning }: { label: string; value: number; tone: "cyan" | "amber" | "green" | "rose" | "violet"; warning?: boolean }) {
  const color = {
    cyan: "from-cyan-300 to-sky-500",
    amber: "from-amber-200 to-orange-500",
    green: "from-emerald-300 to-green-500",
    rose: "from-rose-300 to-red-500",
    violet: "from-violet-300 to-fuchsia-500",
  }[tone];
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs uppercase tracking-[0.22em] text-slate-400">
        <span className={warning ? "animate-pulse text-rose-300" : ""}>{label}</span>
        <span className={`font-semibold ${warning ? "animate-pulse text-rose-300" : "text-slate-100"}`}>{Math.round(value)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full rounded-full bg-gradient-to-r ${color} ${warning ? "animate-pulse" : ""}`} style={{ width: `${clamp(value, 0, 100)}%` }} />
      </div>
    </div>
  );
}

function BoatStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-400">
      <span className="w-20">{label}</span>
      <div className="flex gap-1">
        {Array.from({ length: 5 }, (_, index) => (
          <span key={index} className={`h-1.5 w-5 rounded-full ${index < value ? "bg-cyan-300" : "bg-slate-700"}`} />
        ))}
      </div>
    </div>
  );
}

function ControlButton({ label, sublabel, onHold, active }: { label: string; sublabel: string; onHold: (pressed: boolean) => void; active?: boolean }) {
  const [pressed, setPressed] = useState(false);
  const isActive = active || pressed;
  const handlers = {
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setPressed(true);
      onHold(true);
    },
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      setPressed(false);
      onHold(false);
    },
    onPointerCancel: () => { setPressed(false); onHold(false); },
    onPointerLeave: () => { setPressed(false); onHold(false); },
  };
  return (
    <button
      type="button"
      {...handlers}
      className={`touch-none rounded-2xl border px-3 py-2.5 text-left shadow-lg shadow-slate-950/30 transition active:scale-[0.98] ${
        isActive
          ? "border-cyan-300/70 bg-cyan-950/60 shadow-cyan-950/50"
          : "border-cyan-300/20 bg-slate-900/80 hover:border-cyan-300/50"
      }`}
    >
      <span className={`block text-sm font-semibold transition ${isActive ? "text-cyan-200" : "text-slate-50"}`}>{label}</span>
      <span className={`text-[11px] transition ${isActive ? "text-cyan-400/70" : "text-slate-400"}`}>{sublabel}</span>
    </button>
  );
}

function weaponLabel(weapon: Weapon) {
  return weapon === "cannon" ? "Cannon" : weapon === "rapid" ? "Rapid" : weapon === "spread" ? "Spread" : weapon === "missile" ? "Missile" : "Turret";
}

function weaponColor(weapon: Weapon) {
  return weapon === "rapid" ? "text-rose-300" : weapon === "spread" ? "text-violet-300" : weapon === "missile" ? "text-amber-300" : weapon === "turret" ? "text-teal-300" : "text-cyan-200";
}

/* =====================================================================
 *  ONBOARDING
 * ==================================================================== */

type OnboardingProps = {
  onComplete: () => void;
  onShowRules: () => void;
};

function Onboarding({ onComplete, onShowRules }: OnboardingProps) {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: "Welcome, captain",
      text: "You pilot a river raid boat through hostile waters. Clear bridge targets, dodge enemy fire, and keep your fuel tanks full.",
      accent: "cyan",
      icon: "⚓",
    },
    {
      title: "Controls",
      text: "W / Up throttle up. S / Down to backwater. A and D / Left and Right rudder. Shift for precision steering. Space to fire.",
      accent: "emerald",
      icon: "🎮",
    },
    {
      title: "Pickups",
      text: "Fuel barrels keep you moving. Repair kits restore hull. Shields absorb damage. Weapon crates grant rapid fire, spread shot, or homing missiles.",
      accent: "amber",
      icon: "🎁",
    },
    {
      title: "Progression",
      text: "The mission begins easy. Every kilometer unlocks new enemies and tighter narrows. Destroy bridge targets before reaching them or they'll sink you.",
      accent: "violet",
      icon: "📈",
    },
  ];

  const current = steps[step];
  const last = step === steps.length - 1;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md">
      <div className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-slate-900/90 p-8 shadow-2xl shadow-slate-950/50">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.34em] text-cyan-300">Briefing</p>
          <span className="text-xs text-slate-500">Step {step + 1} / {steps.length}</span>
        </div>

        <div className="mb-5 flex items-center gap-4">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-300/30 bg-slate-950/60 text-3xl">
            {current.icon}
          </span>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-white">{current.title}</h2>
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Captain's briefing</p>
          </div>
        </div>

        <p className="min-h-[78px] text-[15px] leading-7 text-slate-300">{current.text}</p>

        <div className="mb-6 mt-4 flex gap-1.5">
          {steps.map((_, index) => (
            <span
              key={index}
              className={`h-1.5 flex-1 rounded-full transition ${index <= step ? "bg-cyan-300" : "bg-slate-700"}`}
            />
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
          <button
            type="button"
            onClick={onShowRules}
            className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-cyan-300/50"
          >
            View rules
          </button>
          <div className="flex gap-3">
            {step > 0 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-cyan-300/50"
              >
                Back
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                if (last) {
                  onComplete();
                } else {
                  setStep((s) => s + 1);
                }
              }}
              className="rounded-full bg-cyan-300 px-6 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-200"
            >
              {last ? "Begin mission" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
 *  RULES MODAL
 * ==================================================================== */

type RulesProps = { onClose: () => void };

const ENEMY_ROSTER = [
  { name: "Patrol boat", desc: "Steady enemy that patrols the river and fires bullets.", color: "bg-slate-700" },
  { name: "Raider skiff", desc: "Fast zig-zag skiff. Ramming hazard, no gun.", color: "bg-red-900" },
  { name: "Chopper", desc: "Overflying helicopter that drops bombs.", color: "bg-zinc-700" },
  { name: "Submarine", desc: "Surfaces to fire torpedoes, then submerges. Can't be hit while submerged.", color: "bg-slate-900" },
  { name: "Gunboat", desc: "Heavy, fires three-shot bursts. Takes multiple hits.", color: "bg-slate-800" },
  { name: "Jet", desc: "Screams across the sky and launches homing missiles.", color: "bg-gray-600" },
  { name: "Mine", desc: "Floating hazard. Detonates on contact for heavy damage.", color: "bg-rose-900" },
  { name: "Debris", desc: "Floating log. Light damage but slows your boat.", color: "bg-amber-900" },
  { name: "Bridge", desc: "Target. Destroy before crossing or be sunk.", color: "bg-amber-900" },
];

const PICKUP_ROSTER = [
  { name: "Fuel barrel", desc: "+32 fuel. Essential for long runs.", color: "bg-yellow-500" },
  { name: "Repair kit", desc: "+45 hull integrity.", color: "bg-green-600" },
  { name: "Shield", desc: "Absorbs several hits before fading.", color: "bg-blue-500" },
  { name: "Rapid fire", desc: "Dual-stream cannon for a limited ammo count.", color: "bg-red-500" },
  { name: "Spread shot", desc: "Four-way fan blast for a few shots.", color: "bg-violet-600" },
  { name: "Missile crate", desc: "Homing missiles that lock onto enemies.", color: "bg-amber-500" },
  { name: "Turret", desc: "Aimable cannon. Q to toggle, A/D to aim.", color: "bg-teal-500" },
  { name: "Mine pack", desc: "+3 deployable mines. Press E to drop.", color: "bg-rose-500" },
  { name: "Star", desc: "Rare. Huge score bonus.", color: "bg-yellow-300" },
];

function Rules({ onClose }: RulesProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900/95 shadow-2xl shadow-slate-950/60">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.34em] text-cyan-300">Field manual</p>
            <h2 className="text-xl font-semibold text-white">Rules of engagement</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/15 px-4 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-cyan-300/50"
          >
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <section className="space-y-4 text-sm leading-6 text-slate-300">
            <div>
              <h3 className="mb-2 text-base font-semibold text-white">Objective</h3>
              <p>Navigate upstream, destroy every bridge target before crossing, collect fuel and supplies, and survive as long as you can. The longer you run, the harder the river becomes.</p>
            </div>

            <div>
              <h3 className="mb-2 text-base font-semibold text-white">Controls</h3>
              <ul className="grid gap-2 text-sm sm:grid-cols-2">
                <li><span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-cyan-200">W</span> / <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-cyan-200">↑</span> — Add throttle</li>
                <li><span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-cyan-200">S</span> / <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-cyan-200">↓</span> — Backwater / brake</li>
                <li><span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-cyan-200">A</span>/<span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-cyan-200">D</span> — Rudder port/starboard</li>
                <li><span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-cyan-200">Shift</span> — Precision steering</li>
                <li><span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-cyan-200">Space</span> — Fire (hold for auto-fire)</li>
                <li><span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-cyan-200">Q</span> — Toggle turret aim mode</li>
                <li><span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-cyan-200">E</span> — Deploy mine</li>
                <li><span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-cyan-200">P</span> — Pause / Resume</li>
                <li><span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-cyan-200">R</span> — Restart run</li>
                <li><span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-cyan-200">Enter</span> — Launch mission</li>
              </ul>
            </div>

            <div>
              <h3 className="mb-2 text-base font-semibold text-white">Enemies</h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {ENEMY_ROSTER.map((enemy) => (
                  <li key={enemy.name} className="flex items-start gap-3 rounded-xl border border-white/5 bg-slate-900/50 p-3">
                    <span className={`mt-1 h-3 w-3 flex-shrink-0 rounded-full ${enemy.color}`} />
                    <div>
                      <p className="font-semibold text-white">{enemy.name}</p>
                      <p className="text-xs text-slate-400">{enemy.desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="mb-2 text-base font-semibold text-white">Pickups</h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {PICKUP_ROSTER.map((pickup) => (
                  <li key={pickup.name} className="flex items-start gap-3 rounded-xl border border-white/5 bg-slate-900/50 p-3">
                    <span className={`mt-1 h-3 w-3 flex-shrink-0 rounded-full ${pickup.color}`} />
                    <div>
                      <p className="font-semibold text-white">{pickup.name}</p>
                      <p className="text-xs text-slate-400">{pickup.desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="mb-2 text-base font-semibold text-white">Scoring</h3>
              <p>Killing enemies in quick succession builds a combo up to x12. Destroying bridge targets grants large bonuses. Star pickups multiply your score. The further you go, the bigger the payouts — but the tougher the enemies.</p>
            </div>

            <div>
              <h3 className="mb-2 text-base font-semibold text-white">Tips</h3>
              <ul className="list-disc space-y-1 pl-5">
                <li>Watch the throttle gauge — at top speed you handle worse but clear zones faster.</li>
                <li>Shields block one or two big hits; save them for bridges.</li>
                <li>In narrows, use Shift for precision steering to avoid grinding on banks.</li>
                <li>Missiles home, but their ammo is limited — fire wisely.</li>
              </ul>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
 *  HIGH SCORES
 * ==================================================================== */

function HighScores() {
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  useEffect(() => {
    setScores(loadScores());
  }, []);
  if (scores.length === 0) return null;
  return (
    <div className="mt-3 w-full max-w-md rounded-xl border border-white/10 bg-slate-950/70 p-3">
      <p className="mb-2 text-[10px] uppercase tracking-[0.3em] text-cyan-300">High Scores</p>
      <div className="space-y-1">
        {scores.slice(0, 5).map((entry, index) => (
          <div key={index} className="flex items-center justify-between text-[10px] text-slate-400">
            <span className="w-5 text-center text-slate-600">#{index + 1}</span>
            <span className="w-20 truncate font-semibold text-slate-200">{formatScore(entry.score)}</span>
            <span className="w-16 text-right">{entry.distance} m</span>
            <span className="w-14 text-right text-slate-500">{entry.boat}</span>
            <span className="w-12 text-right text-slate-500">{entry.date}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* =====================================================================
 *  APP
 * ==================================================================== */

const ONBOARDING_KEY = "tidal-run-onboarded-v1";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inputsRef = useRef<Inputs>(blankInputs());
  const phaseRef = useRef<Phase>("menu");
  const selectedBoatRef = useRef<Boat>(BOATS[0]);
  const gameRef = useRef<RuntimeGame | null>(createGame(BOATS[0]));
  const [selectedBoatId, setSelectedBoatId] = useState(BOATS[0].id);
  const [phase, setPhase] = useState<Phase>(() => {
    if (typeof window !== "undefined" && !localStorage.getItem(ONBOARDING_KEY)) {
      return "onboarding";
    }
    return "menu";
  });
  const [metrics, setMetrics] = useState<Metrics>(() => metricsFromGame(gameRef.current ?? createGame(BOATS[0])));
  const [result, setResult] = useState("Choose a boat and clear the first bridge target.");
  const [showRules, setShowRules] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [musicOn, setMusicOn] = useState(true);
  const [sfxOn, setSfxOn] = useState(true);

  const selectedBoat = useMemo(
    () => BOATS.find((boat) => boat.id === selectedBoatId) ?? BOATS[0],
    [selectedBoatId],
  );

  useEffect(() => {
    selectedBoatRef.current = selectedBoat;
    if (phaseRef.current === "menu" || phaseRef.current === "ended") {
      const nextGame = createGame(selectedBoat);
      gameRef.current = nextGame;
      setMetrics(metricsFromGame(nextGame));
    }
  }, [selectedBoat]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const startGame = useCallback(() => {
    const nextGame = createGame(selectedBoatRef.current);
    gameRef.current = nextGame;
    inputsRef.current = blankInputs();
    setMetrics(metricsFromGame(nextGame));
    setResult("Bridge targets must be destroyed before you cross them.");
    audio.init();
    audio.setMusicVolume(0.35);
    audio.startMusic();
    phaseRef.current = "playing";
    setPhase("playing");
  }, []);

  const togglePause = useCallback(() => {
    setPhase((current) => {
      const next = current === "playing" ? "paused" : current === "paused" ? "playing" : current;
      phaseRef.current = next;
      return next;
    });
  }, []);

  const setInput = useCallback((name: keyof Inputs, pressed: boolean) => {
    inputsRef.current[name] = pressed;
  }, []);

  const completeOnboarding = useCallback(() => {
    try { localStorage.setItem(ONBOARDING_KEY, "1"); } catch { /* ignore */ }
    phaseRef.current = "menu";
    setPhase("menu");
  }, []);

  const openRules = useCallback(() => {
    setShowRules(true);
    try { localStorage.setItem(ONBOARDING_KEY, "1"); } catch { /* ignore */ }
    if (phaseRef.current === "onboarding") {
      phaseRef.current = "menu";
      setPhase("menu");
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const input = mapKeyToInput(event.code);
      if (input) {
        event.preventDefault();
        inputsRef.current[input] = true;
      }
      if (!event.repeat && event.code === "KeyP") {
        event.preventDefault();
        togglePause();
      }
      if (!event.repeat && event.code === "Enter" && phaseRef.current !== "playing" && phaseRef.current !== "onboarding") {
        event.preventDefault();
        startGame();
      }
      if (!event.repeat && event.code === "KeyR") {
        event.preventDefault();
        startGame();
      }
      if (!event.repeat && event.code === "Escape" && showRules) {
        setShowRules(false);
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      const input = mapKeyToInput(event.code);
      if (input) {
        event.preventDefault();
        inputsRef.current[input] = false;
      }
    };
    const handleBlur = () => {
      inputsRef.current = blankInputs();
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [startGame, togglePause, showRules]);

  useEffect(() => {
    let frame = 0;
    let lastTime = performance.now();
    let lastHudAt = 0;
    let gameOverPlayed = false;
    let warningTimer = 0;
    const loop = (now: number) => {
      const game = gameRef.current;
      const canvas = canvasRef.current;
      const dt = clamp((now - lastTime) / 1000, 0, 0.034);
      lastTime = now;
      if (game && phaseRef.current === "playing") {
        updateGame(game, inputsRef.current, dt);
        if (game.fuel < 20 && game.fuel > 0) {
          warningTimer -= dt;
          if (warningTimer <= 0) {
            audio.playSfx("warning");
            warningTimer = 0.8;
          }
        }
      }
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          prepareCanvas(canvas, ctx);
          if (game && phaseRef.current === "playing") {
            drawGame(ctx, game, phaseRef.current, now / 1000);
          } else {
            drawMenuBackground(ctx, now / 1000);
          }
        }
      }
      if (game && now - lastHudAt > 110) {
        setMetrics(metricsFromGame(game));
        lastHudAt = now;
      }
      if (game?.over && phaseRef.current === "playing") {
        if (!gameOverPlayed) {
          audio.playSfx("gameover");
          audio.stopMusic();
          gameOverPlayed = true;
        }
        setResult(game.message);
        phaseRef.current = "ended";
        setPhase("ended");
        saveScore({
          score: Math.round(game.score),
          distance: Math.round(game.distance),
          bridges: game.bridges,
          enemiesKilled: game.enemiesKilled,
          maxCombo: game.maxCombo,
          tier: tierFor(game.distance).id,
          boat: game.boat.name,
          date: new Date().toLocaleDateString("fr-FR"),
        });
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  const canChooseBoat = phase !== "playing" && phase !== "paused";
  const narrowWarning = metrics.narrowness > 0.45;
  const actionLabel = phase === "playing" ? "Pause" : phase === "paused" ? "Resume" : "Launch";

  const currentTier = TIERS.find((t) => t.id === metrics.tier) ?? TIERS[0];

  return (
    <div className="min-h-dvh overflow-hidden bg-[#020617] text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(14,165,233,0.22),transparent_32%),radial-gradient(circle_at_82%_18%,rgba(34,197,94,0.14),transparent_28%),linear-gradient(180deg,rgba(15,23,42,0.1),rgba(2,6,23,1))]" />

      <button
        type="button"
        onClick={() => setShowRules(true)}
        className="fixed right-4 top-4 z-30 flex items-center gap-2 rounded-full border border-cyan-300/30 bg-slate-900/80 px-4 py-2 text-sm font-semibold text-cyan-100 shadow-lg shadow-slate-950/40 backdrop-blur transition hover:border-cyan-300/60 hover:bg-cyan-950/70"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full border border-cyan-300/60 text-xs font-bold text-cyan-200">?</span>
        <span className="hidden sm:inline">Rules</span>
      </button>

      <button
        type="button"
        onClick={() => setShowInfo(true)}
        title="Comment ce jeu a été fait"
        className="fixed right-4 top-16 z-30 flex items-center gap-2 rounded-full border border-cyan-300/30 bg-slate-900/80 px-4 py-2 text-sm font-semibold text-cyan-100 shadow-lg shadow-slate-950/40 backdrop-blur transition hover:border-cyan-300/60 hover:bg-cyan-950/70"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full border border-cyan-300/60 text-xs font-bold text-cyan-200">i</span>
        <span className="hidden sm:inline">Infos</span>
      </button>

      {phase === "onboarding" ? <Onboarding onComplete={completeOnboarding} onShowRules={openRules} /> : null}
      {showRules ? <Rules onClose={() => setShowRules(false)} /> : null}
      {showInfo ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md" onClick={() => setShowInfo(false)}>
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900/95 shadow-2xl shadow-slate-950/60" onClick={(e) => e.stopPropagation()}>
            <div className="border-b border-white/10 px-6 py-4">
              <h2 className="text-xl font-semibold text-white">Comment ce jeu a été fait</h2>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3.5 text-sm leading-relaxed text-slate-300">
              <p><strong className="text-white">Stack :</strong> React 19, TypeScript 5.9, Tailwind CSS 4, Vite 7, compilé en un seul fichier HTML, aucune dépendance chargée depuis l'extérieur.</p>
              <p><strong className="text-white">Graphismes :</strong> tout est dessiné en Canvas 2D à chaque image (rivière, bateau, ponts, ennemis), aucun sprite ni image externe.</p>
              <p><strong className="text-white">Musique &amp; sons :</strong> synthétisés en direct avec l'API Web Audio, aucun fichier audio chargé.</p>
              <p><strong className="text-white">Interactions :</strong> clavier complet (accélération, gouvernail, tir, mode de visée de tourelle, mines, pause), 4 bateaux aux caractéristiques différentes (vitesse, maniabilité, blindage, consommation).</p>
              <p><strong className="text-white">Architecture :</strong> une seule boucle de jeu Canvas met à jour la physique du bateau et redessine chaque image.</p>
              <p><strong className="text-white">Algorithmes notables :</strong> la difficulté du fleuve augmente progressivement par paliers selon la distance parcourue, un compteur de combo (jusqu'à ×12) récompense les destructions enchaînées sans temps mort.</p>
            </div>
            <div className="border-t border-white/10 px-6 py-4 text-center">
              <button onClick={() => setShowInfo(false)} className="rounded-full border border-white/15 px-6 py-2 text-sm font-semibold text-slate-200 transition hover:border-cyan-300/50">Fermer</button>
            </div>
          </div>
        </div>
      ) : null}

      <main className="relative mx-auto grid min-h-dvh w-full max-w-full grid-cols-1 gap-3 px-2 py-2 sm:gap-4 sm:px-4 sm:py-4 lg:grid-cols-[280px_minmax(320px,1fr)_280px] lg:gap-5 lg:px-5 lg:py-5 xl:max-w-[1400px]">
        <section className="order-2 rounded-[2rem] border border-white/10 bg-slate-950/68 p-3 shadow-2xl shadow-slate-950/30 backdrop-blur sm:p-4 lg:order-1">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.34em] text-cyan-300">Boat yard</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Choose your hull</h2>
            </div>
            <span className="rounded-full border border-cyan-300/20 px-3 py-1 text-xs text-cyan-100">4 boats</span>
          </div>
          <div className="space-y-3">
            {BOATS.map((boat) => {
              const selected = boat.id === selectedBoat.id;
              return (
                <button
                  key={boat.id}
                  type="button"
                  disabled={!canChooseBoat}
                  onClick={() => setSelectedBoatId(boat.id)}
                  className={`w-full rounded-3xl border p-3 text-left transition ${
                    selected
                      ? "border-cyan-300/60 bg-cyan-950/50 shadow-lg shadow-cyan-950/30"
                      : "border-white/10 bg-slate-900/40 hover:border-cyan-300/30 hover:bg-slate-900/70"
                  } ${!canChooseBoat ? "cursor-not-allowed opacity-70" : ""}`}
                  aria-pressed={selected}
                >
                  <div className="flex items-center gap-3">
                    <span className="h-11 w-4 rounded-full" style={{ backgroundColor: boat.hullColor }} />
                    <div>
                      <h3 className="font-semibold text-slate-50">{boat.name}</h3>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{boat.role}</p>
                    </div>
                  </div>
                  {selected ? (
                    <div className="mt-3 space-y-2">
                      <p className="text-sm leading-5 text-slate-300">{boat.note}</p>
                      <BoatStat label="Speed" value={boat.stats.speed} />
                      <BoatStat label="Handling" value={boat.stats.handling} />
                      <BoatStat label="Armor" value={boat.stats.armor} />
                      <BoatStat label="Fuel" value={boat.stats.economy} />
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>

        <section className="order-1 flex flex-col items-center gap-3 lg:order-2">
          <div className="relative mx-auto aspect-[640/900] w-full max-w-full overflow-hidden rounded-[2rem] border border-cyan-300/20 bg-slate-950 shadow-2xl shadow-cyan-950/20 sm:max-w-[620px]">
            <canvas ref={canvasRef} className="h-full w-full touch-none" aria-label="River Raid game canvas" />
            <div className="pointer-events-none absolute left-4 right-4 top-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.32em] text-cyan-200/90">River Raid</p>
                <h1 className="text-2xl font-bold tracking-tight text-white drop-shadow-lg sm:text-3xl">Tidal Run</h1>
              </div>
              <div className="flex flex-col items-end gap-1">
                <div className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.22em] ${narrowWarning ? "border-amber-300/70 bg-amber-400/15 text-amber-100" : "border-cyan-200/20 bg-slate-950/50 text-cyan-100"}`}>
                  {narrowWarning ? "Narrows" : selectedBoat.callsign}
                </div>
                <div className="rounded-full border border-violet-300/30 bg-violet-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-violet-100">
                  Tier {currentTier.id} · {currentTier.name}
                </div>
              </div>
            </div>

            {phase === "playing" && metrics.combo > 1 ? (
              <div className="pointer-events-none absolute right-4 top-24 rounded-2xl border border-amber-300/40 bg-amber-400/10 px-3 py-2 text-right">
                <p className="text-[10px] uppercase tracking-[0.24em] text-amber-200">Combo</p>
                <p className="text-xl font-bold text-amber-100">x{metrics.combo}</p>
              </div>
            ) : null}

            {phase !== "playing" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/48 p-4 backdrop-blur-[2px]">
                <div className="max-w-md rounded-[2rem] border border-white/10 bg-slate-950/88 p-5 text-center shadow-2xl shadow-slate-950/50">
                  <p className="text-xs uppercase tracking-[0.34em] text-cyan-300">
                    {phase === "paused" ? "Paused" : phase === "ended" ? "Run report" : "Mission ready"}
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                    {phase === "ended" ? result : phase === "paused" ? "Hold position in the current" : "Clear bridges. Conserve fuel."}
                  </h2>
                  <p className="mt-2 text-xs leading-5 text-slate-300">
                    {phase === "ended"
                      ? `Score ${formatScore(metrics.score)} \u2022 ${Math.round(metrics.distance)} m \u2022 ${metrics.bridges} bridges \u2022 ${metrics.enemiesKilled} kills \u2022 x${metrics.maxCombo} combo`
                      : "Throttle builds gradually, the rudder lags under load, and the river current keeps pushing your hull toward the banks."}
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-center">
                    <button
                      type="button"
                      onClick={phase === "paused" ? togglePause : startGame}
                      className="rounded-full bg-cyan-300 px-5 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-cyan-950/40 transition hover:bg-cyan-200"
                    >
                      {phase === "paused" ? "Resume run" : "Launch mission"}
                    </button>
                    {phase === "ended" ? (
                      <button
                        type="button"
                        onClick={startGame}
                        className="rounded-full border border-white/15 px-5 py-2 text-xs font-semibold text-slate-100 transition hover:border-cyan-300/50"
                      >
                        Retry same boat
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setShowRules(true)}
                      className="rounded-full border border-white/15 px-5 py-2 text-xs font-semibold text-slate-100 transition hover:border-cyan-300/50"
                    >
                      Rules
                    </button>
                  </div>
                </div>
                {phase === "menu" || phase === "ended" ? <HighScores /> : null}
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:hidden">
            <ControlButton label="Port" sublabel="Hold A" onHold={(pressed) => setInput("left", pressed)} />
            <ControlButton label="Starboard" sublabel="Hold D" onHold={(pressed) => setInput("right", pressed)} />
            <ControlButton label="Throttle" sublabel="Hold W" onHold={(pressed) => setInput("up", pressed)} />
            <ControlButton label="Fire" sublabel="Space" onHold={(pressed) => setInput("fire", pressed)} />
          </div>
        </section>

        <aside className="order-3 space-y-4 rounded-[2rem] border border-white/10 bg-slate-950/68 p-4 shadow-2xl shadow-slate-950/30 backdrop-blur">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={phase === "playing" || phase === "paused" ? togglePause : startGame}
              className="flex-1 rounded-full bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200"
            >
              {actionLabel}
            </button>
            <button
              type="button"
              onClick={startGame}
              className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-cyan-300/50"
            >
              Restart
            </button>
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-900/45 p-4">
            <p className="text-xs uppercase tracking-[0.32em] text-cyan-300">Cockpit</p>
            <div className="mt-4 space-y-4">
              <Meter label="Fuel" value={metrics.fuel} tone={metrics.fuel < 24 ? "rose" : "amber"} warning={metrics.fuel < 20} />
              <Meter label="Hull" value={metrics.hull} tone={metrics.hull < 30 ? "rose" : "green"} />
              <Meter label="Throttle" value={metrics.throttle * 100} tone="cyan" />
              {metrics.shield > 0 ? <Meter label="Shield" value={(metrics.shield / 6) * 100} tone="cyan" /> : null}
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.22em] text-slate-400">
                <span>Mines</span>
                <span className="font-semibold text-slate-100">{metrics.mineCount}</span>
              </div>
              {metrics.turretActive ? (
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.22em]">
                  <span className="text-teal-300">Turret</span>
                  <span className="font-semibold text-teal-200">ACTIVE</span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-900/45 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.32em] text-cyan-300">Armament</p>
              <span className={`text-xs font-bold uppercase tracking-[0.22em] ${weaponColor(metrics.weapon)}`}>
                {weaponLabel(metrics.weapon)}
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <p className="text-2xl font-semibold text-white">
                {metrics.weapon === "cannon" ? "∞" : metrics.ammo}
              </p>
              <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                {metrics.weapon === "cannon" ? "rounds" : "rounds left"}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setMusicOn((v) => { const n = !v; audio.setMusicEnabled(n); return n; }); }}
              className={`flex-1 rounded-full border px-3 py-2 text-xs font-semibold transition ${
                musicOn
                  ? "border-cyan-300/50 bg-cyan-950/40 text-cyan-200"
                  : "border-white/10 bg-slate-900/40 text-slate-500"
              }`}
            >
              {musicOn ? "Music ON" : "Music OFF"}
            </button>
            <button
              type="button"
              onClick={() => { setSfxOn((v) => { const n = !v; audio.setSfxEnabled(n); return n; }); }}
              className={`flex-1 rounded-full border px-3 py-2 text-xs font-semibold transition ${
                sfxOn
                  ? "border-cyan-300/50 bg-cyan-950/40 text-cyan-200"
                  : "border-white/10 bg-slate-900/40 text-slate-500"
              }`}
            >
              {sfxOn ? "SFX ON" : "SFX OFF"}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-3xl border border-white/10 bg-slate-900/45 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Score</p>
              <p className="mt-1 text-2xl font-semibold text-white">{formatScore(metrics.score)}</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-slate-900/45 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Speed</p>
              <p className="mt-1 text-2xl font-semibold text-white">{Math.round(metrics.speed / 2.2)} kt</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-slate-900/45 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Range</p>
              <p className="mt-1 text-2xl font-semibold text-white">{Math.round(metrics.distance)} m</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-slate-900/45 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Bridges</p>
              <p className="mt-1 text-2xl font-semibold text-white">{metrics.bridges}</p>
            </div>
          </div>

          <div className="rounded-3xl border border-cyan-300/15 bg-cyan-950/20 p-4">
            <p className="text-xs uppercase tracking-[0.32em] text-cyan-300">Real controls</p>
            <div className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
              <p>W or Up: add throttle. S or Down: backwater and reduce speed.</p>
              <p>A/D or arrows: hold rudder to port or starboard. Shift: precision steering.</p>
              <p>Space: cannon (hold for auto-fire). Q: toggle turret aim. E: drop mine.</p>
              <p>P: pause. R: restart. Enter: launch.</p>
            </div>
          </div>

          <div className="hidden grid-cols-2 gap-3 lg:grid">
            <ControlButton label="Port" sublabel="A / Left" onHold={(pressed) => setInput("left", pressed)} />
            <ControlButton label="Starboard" sublabel="D / Right" onHold={(pressed) => setInput("right", pressed)} />
            <ControlButton label="Throttle" sublabel="W / Up" onHold={(pressed) => setInput("up", pressed)} />
            <ControlButton label="Backwater" sublabel="S / Down" onHold={(pressed) => setInput("down", pressed)} />
            <ControlButton label="Fire" sublabel="Space" onHold={(pressed) => setInput("fire", pressed)} />
            <ControlButton label="Precision" sublabel="Shift" onHold={(pressed) => setInput("precision", pressed)} />
            <ControlButton label="Turret" sublabel="Q toggle" onHold={(pressed) => setInput("turret", pressed)} />
            <ControlButton label="Mine" sublabel="E drop" onHold={(pressed) => setInput("mine", pressed)} />
          </div>

          <p className="text-center text-[10px] uppercase tracking-[0.3em] text-slate-600">
            Created by Geoffroy <span className="text-cyan-500/70">Hylst</span>
          </p>
        </aside>
      </main>
    </div>
  );
}
