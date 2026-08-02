const STORAGE_KEY = "tidalrun-highscores-v1";
const MAX_SCORES = 10;

export type ScoreEntry = {
  score: number;
  distance: number;
  bridges: number;
  enemiesKilled: number;
  maxCombo: number;
  tier: number;
  boat: string;
  date: string;
};

export function loadScores(): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ScoreEntry[];
  } catch {
    return [];
  }
}

export function saveScore(entry: ScoreEntry): { rank: number; isNew: boolean } {
  const scores = loadScores();
  scores.push(entry);
  scores.sort((a, b) => b.score - a.score);
  const trimmed = scores.slice(0, MAX_SCORES);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch { }
  const index = trimmed.findIndex((s) => s === entry);
  return { rank: index + 1, isNew: index < scores.length && index < MAX_SCORES };
}
