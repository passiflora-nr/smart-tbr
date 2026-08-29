import type { TestProject } from "vitest/node";
import { startLocalServices, stopLocalServices, type LocalServiceHandles } from "./support/local-services";

let handles: LocalServiceHandles | null = null;

export async function setup(project: TestProject): Promise<void> {
  handles = await startLocalServices();
  project.provide("astroBaseUrl", handles.astroBaseUrl);
  project.provide("supabaseUrl", handles.supabaseUrl);
  project.provide("supabaseKey", handles.supabaseKey);
  project.provide("supabaseDbUrl", handles.supabaseDbUrl);
}

export async function teardown(): Promise<void> {
  if (handles) {
    await stopLocalServices(handles);
    handles = null;
  }
}
