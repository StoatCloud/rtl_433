import {
  loadState,
  normalizeHexPayload,
  saveState
} from "./persistence.js";
import { parseAnalyzerOutput, recommendFlexDecoder } from "./decoder-advisor.js";
import { runRtl433 } from "./rtl433-process.js";

function parseJsonLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function parseTimestamp(value) {
  if (!value) {
    return Date.now();
  }
  const parsed = new Date(value).getTime();
  if (Number.isNaN(parsed)) {
    return Date.now();
  }
  return parsed;
}

class EventAggregator {
  constructor({ debounceMs = 350, minPresses = 2 } = {}) {
    this.debounceMs = debounceMs;
    this.minPresses = minPresses;
    this.records = new Map();
  }

  ingestEvent(event) {
    const payload = normalizeHexPayload(event?.data);
    if (!payload) {
      return;
    }

    const timestampMs = parseTimestamp(event.time);
    const existing =
      this.records.get(payload) ??
      {
        payload,
        firstSeen: new Date(timestampMs).toISOString(),
        lastSeen: new Date(timestampMs).toISOString(),
        rawCount: 0,
        pressCount: 0,
        avgRssi: null,
        avgSnr: null,
        bits: []
      };

    existing.rawCount += 1;
    const lastSeenMs = new Date(existing.lastSeen).getTime();
    if (timestampMs - lastSeenMs > this.debounceMs) {
      existing.pressCount += 1;
    } else if (existing.pressCount === 0) {
      existing.pressCount = 1;
    }
    existing.lastSeen = new Date(timestampMs).toISOString();

    if (Number.isFinite(event.rssi)) {
      existing.avgRssi =
        existing.avgRssi === null
          ? event.rssi
          : Number(((existing.avgRssi + event.rssi) / 2).toFixed(2));
    }
    if (Number.isFinite(event.snr)) {
      existing.avgSnr =
        existing.avgSnr === null
          ? event.snr
          : Number(((existing.avgSnr + event.snr) / 2).toFixed(2));
    }

    if (Number.isFinite(event.bits) && !existing.bits.includes(event.bits)) {
      existing.bits.push(event.bits);
      existing.bits.sort((a, b) => a - b);
    }

    this.records.set(payload, existing);
  }

  summarize() {
    const switches = Array.from(this.records.values()).map((record) => {
      const confidence =
        record.pressCount >= this.minPresses
          ? "high"
          : record.rawCount >= this.minPresses
            ? "medium"
            : "low";
      return {
        ...record,
        confidence
      };
    });

    switches.sort((a, b) => b.pressCount - a.pressCount || b.rawCount - a.rawCount);
    return {
      totalCandidates: switches.length,
      likelySwitches: switches.filter((item) => item.confidence !== "low").length,
      switches
    };
  }
}

export async function analyzeSignal({
  frequency = 433_920_000,
  durationSeconds = 30,
  device,
  binaryPath
}) {
  const args = ["-f", String(frequency), "-R", "0", "-A", "-T", String(durationSeconds)];
  if (device) {
    args.unshift(device);
    args.unshift("-d");
  }

  const run = await runRtl433({
    binaryPath,
    args,
    timeoutMs: Math.max(15_000, durationSeconds * 2_000)
  });

  const combinedLines = [...run.stdoutLines, ...run.stderrLines];
  const parsed = parseAnalyzerOutput(combinedLines);
  const recommendation = recommendFlexDecoder(parsed);

  const state = await loadState();
  state.sessions.push({
    kind: "analysis",
    createdAt: new Date().toISOString(),
    frequency,
    durationSeconds,
    recommendation
  });
  await saveState(state);

  return {
    exitCode: run.code,
    parsed,
    recommendation
  };
}

export async function discoverSwitches({
  decoder,
  frequency = 433_920_000,
  durationSeconds = 60,
  sampleRate = 250_000,
  device,
  binaryPath
}) {
  const args = [
    "-f",
    String(frequency),
    "-s",
    String(sampleRate),
    "-R",
    "0",
    "-F",
    "json",
    "-M",
    "time:iso:utc",
    "-M",
    "level",
    "-T",
    String(durationSeconds)
  ];
  if (decoder) {
    args.push("-X", decoder);
  }
  if (device) {
    args.unshift(device);
    args.unshift("-d");
  }

  const aggregator = new EventAggregator();

  const run = await runRtl433({
    binaryPath,
    args,
    timeoutMs: Math.max(20_000, durationSeconds * 2_000),
    onStdoutLine: (line) => {
      const parsed = parseJsonLine(line);
      if (!parsed) {
        return;
      }
      aggregator.ingestEvent({
        data: parsed.data ?? parsed.code ?? "",
        time: parsed.time,
        rssi: typeof parsed.rssi === "number" ? parsed.rssi : Number.NaN,
        snr: typeof parsed.snr === "number" ? parsed.snr : Number.NaN,
        bits: typeof parsed.bits === "number" ? parsed.bits : Number.NaN
      });
    }
  });

  const summary = aggregator.summarize();
  const state = await loadState();

  for (const sw of summary.switches) {
    state.discovered[sw.payload] = {
      ...(state.discovered[sw.payload] ?? {}),
      ...sw,
      updatedAt: new Date().toISOString()
    };
  }

  state.sessions.push({
    kind: "discovery",
    createdAt: new Date().toISOString(),
    frequency,
    durationSeconds,
    decoder,
    summary
  });
  await saveState(state);

  return {
    exitCode: run.code,
    summary
  };
}

export async function getPersistedState() {
  return loadState();
}
