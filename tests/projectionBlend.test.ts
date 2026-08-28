import { describe, expect, it } from "vitest";
import { blendProjection } from "@/lib/projections/blend";

describe("projection blending", () => {
  it("blends a bias-corrected RB projection with shrunk history", () => {
    expect(
      blendProjection({
        position: "RB",
        projectedPerGame: 4,
        priorAvgPoints: 6,
        priorWeeks: 12,
        positionMeanPerGame: 5.39,
        adp: null,
      }),
    ).toEqual({ perGame: 5.726, basis: "BLEND", confidence: "MEDIUM" });
  });

  it("uses history alone for QB and marks it low confidence", () => {
    expect(
      blendProjection({
        position: "QB",
        projectedPerGame: 20,
        priorAvgPoints: 12,
        priorWeeks: 12,
        positionMeanPerGame: 9.98,
        adp: null,
      }),
    ).toEqual({ perGame: 11.192, basis: "HISTORY", confidence: "LOW" });
  });

  it("uses ADP for a rookie pass catcher", () => {
    expect(
      blendProjection({
        position: "WR",
        projectedPerGame: null,
        priorAvgPoints: null,
        priorWeeks: null,
        positionMeanPerGame: null,
        adp: 100,
      }),
    ).toEqual({ perGame: 1.634, basis: "ADP", confidence: "LOW" });
  });

  it("falls back to the position mean when no ADP bins exist", () => {
    expect(
      blendProjection({
        position: "QB",
        projectedPerGame: null,
        priorAvgPoints: null,
        priorWeeks: null,
        positionMeanPerGame: null,
        adp: 100,
      }),
    ).toEqual({ perGame: null, basis: null, confidence: "LOW" });
  });

  it("uses a position mean as a low-confidence blend anchor", () => {
    expect(
      blendProjection({
        position: "RB",
        projectedPerGame: 4,
        priorAvgPoints: null,
        priorWeeks: null,
        positionMeanPerGame: null,
        adp: null,
      }),
    ).toEqual({ perGame: 5.543, basis: "BLEND", confidence: "LOW" });
  });

  it("preserves unavailable values", () => {
    expect(
      blendProjection({
        position: "QB",
        projectedPerGame: null,
        priorAvgPoints: null,
        priorWeeks: null,
        positionMeanPerGame: null,
        adp: null,
      }),
    ).toEqual({ perGame: null, basis: null, confidence: "LOW" });
    expect(
      blendProjection({
        position: null,
        projectedPerGame: null,
        priorAvgPoints: null,
        priorWeeks: null,
        positionMeanPerGame: null,
        adp: null,
      }),
    ).toEqual({ perGame: null, basis: null, confidence: "LOW" });
  });

  it("uses history for unknown positions", () => {
    expect(
      blendProjection({
        position: "FB",
        projectedPerGame: 4,
        priorAvgPoints: 6,
        priorWeeks: 12,
        positionMeanPerGame: null,
        adp: null,
      }),
    ).toEqual({ perGame: 6, basis: "HISTORY", confidence: "LOW" });
  });
});
