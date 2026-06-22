// BLOC 1 - Role du fichier.
// Ce fichier regroupe des fonctions utilitaires frontend autour de recentInputs.
// Point de vigilance: modifier avec prudence car ce fichier peut etre importe par plusieurs modules.

export function loadRecentList(key, maxItems = 8) {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(Boolean).slice(0, maxItems);
  } catch {
    return [];
  }
}

export function saveRecentValue(key, value, maxItems = 8) {
  if (typeof window === 'undefined') return;
  const v = String(value || '').trim();
  if (!v) return;
  try {
    const current = loadRecentList(key, maxItems);
    const next = [v, ...current.filter((x) => String(x).trim() !== v)].slice(0, maxItems);
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // best-effort only
  }
}

