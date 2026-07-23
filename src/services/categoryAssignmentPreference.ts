const STORAGE_KEY = 'chrono_entry_category_required';

let sessionValue: boolean | null = null;

function getStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function isEntryCategoryRequired(): boolean {
  if (sessionValue !== null) {
    return sessionValue;
  }

  try {
    const raw = getStorage()?.getItem(STORAGE_KEY);
    if (raw === 'false') return false;
    if (raw === 'true') return true;
    return true;
  } catch {
    return true;
  }
}

export function setEntryCategoryRequired(value: boolean): void {
  sessionValue = value;
  try {
    getStorage()?.setItem(STORAGE_KEY, String(value));
  } catch {
    // The in-memory value keeps UI and write policy consistent this session.
  }
}

export function resetEntryCategoryPreferenceForTests(): void {
  sessionValue = null;
}
