import * as core from "../index";

describe("Public API exports", () => {
  it("exposes all runtime exports from the package entrypoint", () => {
    const keys = Object.keys(core);
    expect(keys.length).toBeGreaterThan(0);

    // Touch every export to exercise CommonJS getter re-exports in `src/index.ts`
    // (these getters count toward Jest function coverage).
    for (const key of keys) {
      const value = (core as any)[key];
      expect(value).not.toBeUndefined();
    }
  });
});

