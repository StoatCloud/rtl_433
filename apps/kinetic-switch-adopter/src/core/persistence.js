import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const APP_DIR_NAME = ".kinetic-switch-adopter";
const STATE_FILENAME = "state.json";

function defaultState() {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sessions: [],
    discovered: {},
    adopted: {}
  };
}

export function getAppHomeDir() {
  const configured = process.env.KINETIC_SWITCH_HOME;
  if (configured && configured.trim().length > 0) {
    return configured;
  }
  return path.join(os.homedir(), APP_DIR_NAME);
}

export function getStatePath() {
  return path.join(getAppHomeDir(), STATE_FILENAME);
}

export async function loadState() {
  const statePath = getStatePath();
  try {
    const raw = await fs.readFile(statePath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      ...defaultState(),
      ...parsed
    };
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return defaultState();
    }
    throw error;
  }
}

async function atomicWriteJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmpPath, filePath);
}

export async function saveState(state) {
  const stateWithTimestamp = {
    ...state,
    updatedAt: new Date().toISOString()
  };
  await atomicWriteJson(getStatePath(), stateWithTimestamp);
  return stateWithTimestamp;
}

export function normalizeHexPayload(payload) {
  return String(payload ?? "")
    .trim()
    .replace(/^0x/i, "")
    .toLowerCase();
}
