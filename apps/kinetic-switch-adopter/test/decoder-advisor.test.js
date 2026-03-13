import test from "node:test";
import assert from "node:assert/strict";
import {
  parseAnalyzerOutput,
  recommendFlexDecoder
} from "../src/core/decoder-advisor.js";

test("parse analyzer output and recommend strict decoder", () => {
  const sample = [
    "Detected OOK package",
    "Pulse width distribution:",
    "[ 0] count: 40,  width:   52 us",
    "[ 1] count: 52,  width:  188 us",
    "Gap width distribution:",
    "[ 0] count: 11,  width: 1000 us",
    "[ 1] count: 5,  width: 5000 us",
    "Guessing modulation: Pulse Width Modulation with fixed period",
    "[00] {14}e198",
    "[01] {14}ecac"
  ];

  const parsed = parseAnalyzerOutput(sample);
  const recommendation = recommendFlexDecoder(parsed);

  assert.equal(recommendation.usable, true);
  assert.match(recommendation.decoder, /n=KineticSwitch,m=OOK_PWM/);
  assert.match(recommendation.decoder, /bits>=14,bits<=14/);
  assert.match(recommendation.decoder, /s=52/);
  assert.match(recommendation.decoder, /l=188/);
});
