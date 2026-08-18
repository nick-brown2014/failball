import { describe, expect, it } from "vitest";
import { resolveDraftOrder } from "@/lib/draft/order";

describe("resolveDraftOrder", () => {
  it("resolves snake order at round boundaries", () => {
    expect(resolveDraftOrder(1, 3, "SNAKE")).toEqual({
      round: 1,
      pickInRound: 1,
      orderPosition: 1,
    });
    expect(resolveDraftOrder(3, 3, "SNAKE")).toEqual({
      round: 1,
      pickInRound: 3,
      orderPosition: 3,
    });
    expect(resolveDraftOrder(4, 3, "SNAKE")).toEqual({
      round: 2,
      pickInRound: 1,
      orderPosition: 3,
    });
    expect(resolveDraftOrder(6, 3, "SNAKE")).toEqual({
      round: 2,
      pickInRound: 3,
      orderPosition: 1,
    });
  });

  it("keeps linear order in every round", () => {
    expect(resolveDraftOrder(4, 3, "LINEAR")).toEqual({
      round: 2,
      pickInRound: 1,
      orderPosition: 1,
    });
    expect(resolveDraftOrder(6, 3, "LINEAR")).toEqual({
      round: 2,
      pickInRound: 3,
      orderPosition: 3,
    });
  });

  it("resolves the last pick of a draft", () => {
    expect(resolveDraftOrder(12, 4, "SNAKE")).toEqual({
      round: 3,
      pickInRound: 4,
      orderPosition: 4,
    });
    expect(resolveDraftOrder(12, 4, "LINEAR")).toEqual({
      round: 3,
      pickInRound: 4,
      orderPosition: 4,
    });
  });
});
