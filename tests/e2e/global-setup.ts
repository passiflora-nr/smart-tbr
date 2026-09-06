import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  startLocalServices,
  stopLocalServices,
  toLocalServiceSnapshot,
  type LocalServiceHandles,
} from "../integration/support/local-services";

const SNAPSHOT_PATH = path.join(process.cwd(), "playwright/.auth/local-services.json");

export default async function globalSetup(): Promise<void> {
  let handles: LocalServiceHandles | undefined;
  try {
    handles = await startLocalServices({ surviveParentExit: true });
    const snapshot = toLocalServiceSnapshot(handles);
    mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
    writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot), "utf8");
  } catch (error) {
    if (handles) {
      await stopLocalServices(handles);
    }
    throw error;
  }
}
