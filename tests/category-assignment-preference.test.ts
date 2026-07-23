import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isEntryCategoryRequired,
  resetEntryCategoryPreferenceForTests,
  setEntryCategoryRequired,
} from '../src/services/categoryAssignmentPreference';

function createStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

function installStorage(storage: Storage): void {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  });
}

test.beforeEach(() => {
  resetEntryCategoryPreferenceForTests();
  installStorage(createStorage());
});

test('missing preference defaults to enabled', () => {
  assert.equal(isEntryCategoryRequired(), true);
});

test('invalid persisted value defaults to enabled', () => {
  installStorage(createStorage({ chrono_entry_category_required: 'invalid' }));
  assert.equal(isEntryCategoryRequired(), true);
});

test('explicit disabled and enabled values persist', () => {
  setEntryCategoryRequired(false);
  assert.equal(localStorage.getItem('chrono_entry_category_required'), 'false');
  assert.equal(isEntryCategoryRequired(), false);

  setEntryCategoryRequired(true);
  assert.equal(localStorage.getItem('chrono_entry_category_required'), 'true');
  assert.equal(isEntryCategoryRequired(), true);
});

test('session value remains consistent when storage write fails', () => {
  installStorage({
    ...createStorage(),
    setItem() {
      throw new Error('storage unavailable');
    },
  });

  setEntryCategoryRequired(false);

  assert.equal(isEntryCategoryRequired(), false);
});
