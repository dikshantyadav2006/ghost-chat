"use client";

/**
 * Thin wrapper around the Origin Private File System (OPFS) for persisting
 * large files outside IndexedDB.  Falls back gracefully when OPFS is
 * unavailable (e.g. Safari, file:// protocol).
 */

const DIR_NAME = "ghost-files";

async function getRoot(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(DIR_NAME, { create: true });
  } catch {
    return null;
  }
}

/** Write a Blob to OPFS under `ghost-files/<id>`. Returns the path key. */
export async function opfsWrite(id: string, blob: Blob): Promise<string | null> {
  const dir = await getRoot();
  if (!dir) return null;
  try {
    const handle = await dir.getFileHandle(id, { create: true });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return `${DIR_NAME}/${id}`;
  } catch {
    return null;
  }
}

/** Read a Blob from OPFS. Returns null if not found or OPFS unavailable. */
export async function opfsRead(path: string): Promise<Blob | null> {
  const dir = await getRoot();
  if (!dir) return null;
  try {
    const id = path.split("/").pop();
    if (!id) return null;
    const handle = await dir.getFileHandle(id);
    const file = await handle.getFile();
    return file;
  } catch {
    return null;
  }
}

/** Delete a file from OPFS. */
export async function opfsDelete(path: string): Promise<void> {
  const dir = await getRoot();
  if (!dir) return;
  try {
    const id = path.split("/").pop();
    if (id) await dir.removeEntry(id);
  } catch {
    // ignore
  }
}
