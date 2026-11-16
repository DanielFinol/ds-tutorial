// Per-viewer lesson progress, kept in localStorage (best effort: may be unavailable).
const KEY = 'ds2026:completed';

export function getCompleted(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

export function setCompleted(id: string, done: boolean): void {
  const s = getCompleted();
  done ? s.add(id) : s.delete(id);
  try {
    localStorage.setItem(KEY, JSON.stringify([...s]));
  } catch {
    /* storage unavailable: progress just won't persist */
  }
}
