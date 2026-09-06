import { existsSync, readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { parseLocalServiceSnapshot, stopLocalServicesFromSnapshot } from "../integration/support/local-services";

const SNAPSHOT_PATH = path.join(process.cwd(), "playwright/.auth/local-services.json");

export default async function globalTeardown(): Promise<void> {
  if (!existsSync(SNAPSHOT_PATH)) {
    return;
  }

  const raw = readFileSync(SNAPSHOT_PATH, "utf8");
  unlinkSync(SNAPSHOT_PATH);
  const snapshot = parseLocalServiceSnapshot(raw);
  await stopLocalServicesFromSnapshot(snapshot);
}
