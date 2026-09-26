import "server-only";

import { type FileStore, localFileStore } from "./local-store";

/** The app's document file store: a local folder until Azure Blob Storage is set up (docs/azure-setup.md, step 8). */
let store: FileStore | undefined;
export function fileStore(): FileStore {
  return (store ??= localFileStore(process.env.LOCAL_FILE_DIR || ".data/uploads"));
}
