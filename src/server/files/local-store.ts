import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/*
 * Where document files are kept. Today: a folder on this computer (.data/uploads, git-ignored).
 * In Azure: Blob Storage (container "documents"), behind the same two functions, so nothing
 * else changes. Keys look like "<company>/<document id>/<file name>".
 */

export type FileStore = {
  put(key: string, data: Uint8Array): Promise<void>;
  /** The file's bytes, or null if there's no such file. */
  read(key: string): Promise<Uint8Array | null>;
};

const KEY = /^[a-z0-9-]+\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

/** A store on the local disk, confined to `root`: keys can't climb out of it. */
export function localFileStore(root: string): FileStore {
  const base = path.resolve(root);
  const resolve = (key: string) => {
    if (!KEY.test(key)) throw new Error("Invalid file key");
    const full = path.resolve(base, key);
    if (!full.startsWith(base + path.sep)) throw new Error("Invalid file key");
    return full;
  };

  return {
    async put(key, data) {
      const full = resolve(key);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, data, { flag: "wx" }); // never overwrite: every version is kept
    },
    async read(key) {
      try {
        return new Uint8Array(await readFile(resolve(key)));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
  };
}
