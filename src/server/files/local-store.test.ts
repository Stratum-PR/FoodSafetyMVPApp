// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { localFileStore } from "./local-store";

const root = await mkdtemp(path.join(tmpdir(), "stratum-files-"));
const store = localFileStore(root);
afterAll(() => rm(root, { recursive: true, force: true }));

describe("local file store", () => {
  it("stores and reads a file back", async () => {
    const data = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
    await store.put("alimentos-cordillera/up-1/cert.pdf", data);
    expect(await store.read("alimentos-cordillera/up-1/cert.pdf")).toEqual(data);
  });

  it("returns null for a file that doesn't exist", async () => {
    expect(await store.read("alimentos-cordillera/up-2/none.pdf")).toBeNull();
  });

  it("never overwrites a stored file", async () => {
    await store.put("alimentos-cordillera/up-3/a.pdf", new Uint8Array([1]));
    await expect(store.put("alimentos-cordillera/up-3/a.pdf", new Uint8Array([2]))).rejects.toThrow();
  });

  it("refuses keys that could escape its folder", async () => {
    for (const key of ["../x/y/z.pdf", "a/../../b.pdf", "/etc/passwd", "a\\b\\c.pdf", "A/b/c.pdf", "a/b"]) {
      await expect(store.put(key, new Uint8Array([1]))).rejects.toThrow("Invalid file key");
      await expect(store.read(key)).rejects.toThrow("Invalid file key");
    }
  });
});
