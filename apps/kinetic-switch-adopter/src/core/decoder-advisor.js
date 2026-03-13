function parseWidthLine(line) {
  const match = line.match(/count:\s*(\d+),\s*width:\s*(\d+)\s*us/i);
  if (!match) {
    return null;
  }
  return {
    count: Number(match[1]),
    widthUs: Number(match[2])
  };
}

function weightedMedian(entries) {
  if (!entries.length) {
    return null;
  }
  const sorted = [...entries].sort((a, b) => a.widthUs - b.widthUs);
  const total = sorted.reduce((sum, entry) => sum + entry.count, 0);
  let running = 0;
  for (const entry of sorted) {
    running += entry.count;
    if (running >= total / 2) {
      return entry.widthUs;
    }
  }
  return sorted.at(-1).widthUs;
}

function dominantWidths(entries) {
  return [...entries].sort((a, b) => b.count - a.count).slice(0, 4);
}

export function parseAnalyzerOutput(lines) {
  const pulseWidths = [];
  const gapWidths = [];
  const periodWidths = [];
  const codeRows = [];
  let currentSection = "";
  let guessedModulation = null;

  for (const rawLine of lines) {
    const line = String(rawLine);
    if (line.includes("Pulse width distribution")) {
      currentSection = "pulse";
      continue;
    }
    if (line.includes("Gap width distribution")) {
      currentSection = "gap";
      continue;
    }
    if (line.includes("Pulse period distribution")) {
      currentSection = "period";
      continue;
    }

    const modulationMatch = line.match(/Guessing modulation:\s*(.+)$/i);
    if (modulationMatch) {
      guessedModulation = modulationMatch[1].trim();
    }

    const codeMatch = line.match(/\[\d+\]\s+\{(\d+)\}([0-9a-fA-F]+)/);
    if (codeMatch) {
      codeRows.push({
        bits: Number(codeMatch[1]),
        data: codeMatch[2].toLowerCase()
      });
    }

    const parsedWidth = parseWidthLine(line);
    if (!parsedWidth) {
      continue;
    }
    if (currentSection === "pulse") {
      pulseWidths.push(parsedWidth);
    } else if (currentSection === "gap") {
      gapWidths.push(parsedWidth);
    } else if (currentSection === "period") {
      periodWidths.push(parsedWidth);
    }
  }

  return {
    guessedModulation,
    pulseWidths,
    gapWidths,
    periodWidths,
    codeRows
  };
}

export function recommendFlexDecoder(parsed, name = "KineticSwitch") {
  const dominantPulse = dominantWidths(parsed.pulseWidths);
  if (dominantPulse.length < 2) {
    return {
      usable: false,
      reason: "Not enough pulse width samples to infer short/long timings."
    };
  }

  const candidate = [...dominantPulse].sort((a, b) => a.widthUs - b.widthUs);
  const shortUs = candidate[0].widthUs;
  const longUs = candidate.at(-1).widthUs;

  const gapMedian = weightedMedian(parsed.gapWidths) ?? 1000;
  const resetUs = Math.max(gapMedian * 5, 5000);

  const bits = parsed.codeRows.map((row) => row.bits);
  const bitsMin = bits.length ? Math.min(...bits) : 14;
  const bitsMax = bits.length ? Math.max(...bits) : 24;

  const decoder = `n=${name},m=OOK_PWM,s=${shortUs},l=${longUs},g=${gapMedian},r=${resetUs},bits>=${bitsMin},bits<=${bitsMax},unique`;
  return {
    usable: true,
    decoder,
    metrics: {
      shortUs,
      longUs,
      gapUs: gapMedian,
      resetUs,
      bitsMin,
      bitsMax,
      samples: {
        pulse: parsed.pulseWidths.length,
        gap: parsed.gapWidths.length,
        codeRows: parsed.codeRows.length
      },
      guessedModulation: parsed.guessedModulation
    }
  };
}
