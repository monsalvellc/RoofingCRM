/**
 * Local Vault — JSON entity persistence via expo-file-system.
 *
 * Each entity is stored as an individual JSON file at:
 *   <documentDirectory>/Vault/<collection>/<id>.json
 *
 * This gives us true cross-session offline persistence that survives app
 * restarts, independent of the Firestore JS SDK's in-memory-only cache.
 * Once the entity is confirmed synced to Firestore, call deleteLocalEntity
 * to remove the file and prevent stale data showing indefinitely.
 */

import * as FileSystem from 'expo-file-system/legacy';

const VAULT_ROOT = `${FileSystem.documentDirectory}Vault/`;

// ─── Internal Helpers ─────────────────────────────────────────────────────────

function collectionDir(collection: string): string {
  return `${VAULT_ROOT}${collection}/`;
}

function entityPath(collection: string, id: string): string {
  return `${collectionDir(collection)}${id}.json`;
}

/** Ensures the directory exists before writing to it. */
async function ensureDir(dir: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Persists a single entity to disk.
 * The `data` object must have an `id` field — this becomes the filename.
 * Overwrites any existing file for the same id (safe for optimistic updates).
 */
export async function saveLocalEntity(
  collection: string,
  data: Record<string, unknown> & { id: string },
): Promise<void> {
  try {
    await ensureDir(collectionDir(collection));
    await FileSystem.writeAsStringAsync(
      entityPath(collection, data.id),
      JSON.stringify(data),
      { encoding: FileSystem.EncodingType.UTF8 },
    );
  } catch (error) {
    console.warn(`[localVault] saveLocalEntity(${collection}/${data.id}) failed:`, error);
  }
}

/**
 * Returns all entities stored locally for the given collection.
 * Files that fail to parse are skipped silently rather than crashing the caller.
 */
export async function getLocalEntities<T = Record<string, unknown>>(
  collection: string,
): Promise<T[]> {
  try {
    const dir = collectionDir(collection);
    await ensureDir(dir);
    const files = await FileSystem.readDirectoryAsync(dir);
    const results: T[] = [];

    await Promise.all(
      files
        .filter((f) => f.endsWith('.json'))
        .map(async (file) => {
          try {
            const raw = await FileSystem.readAsStringAsync(`${dir}${file}`, {
              encoding: FileSystem.EncodingType.UTF8,
            });
            results.push(JSON.parse(raw) as T);
          } catch {
            // Corrupt or partially-written file — skip it.
          }
        }),
    );

    return results;
  } catch (error) {
    console.warn(`[localVault] getLocalEntities(${collection}) failed:`, error);
    return [];
  }
}

/**
 * Returns a single entity from the vault by ID, or null if it isn't there.
 * Reads the specific `<id>.json` file directly — no directory scan.
 */
export async function getLocalEntity<T = Record<string, unknown>>(
  collection: string,
  id: string,
): Promise<T | null> {
  try {
    const path = entityPath(collection, id);
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(path, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return JSON.parse(raw) as T;
  } catch (error) {
    console.warn(`[localVault] getLocalEntity(${collection}/${id}) failed:`, error);
    return null;
  }
}

/**
 * Removes a single entity file from the vault.
 * Call this after a successful Firestore server-sync confirmation.
 * Safe to call even if the file no longer exists (idempotent).
 */
export async function deleteLocalEntity(collection: string, id: string): Promise<void> {
  try {
    await FileSystem.deleteAsync(entityPath(collection, id), { idempotent: true });
  } catch (error) {
    console.warn(`[localVault] deleteLocalEntity(${collection}/${id}) failed:`, error);
  }
}
