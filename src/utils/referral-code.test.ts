import { describe, expect, it } from "vitest";

import { generateReferralCode, generateUniqueCodes } from "./referral-code.js";

describe("generateReferralCode", () => {
  it("generates a 6-character string", () => {
    const code = generateReferralCode();
    expect(code).toHaveLength(6);
  });

  it("uses only uppercase letters and digits", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateReferralCode();
      expect(code).toMatch(/^[A-Z0-9]{6}$/);
    }
  });
});

describe("generateUniqueCodes", () => {
  it("generates the requested number of codes", () => {
    const codes = generateUniqueCodes(5);
    expect(codes).toHaveLength(5);
  });

  it("generates unique codes", () => {
    const codes = generateUniqueCodes(20);
    const unique = new Set(codes);
    expect(unique.size).toBe(20);
  });

  it("generates zero codes when count is 0", () => {
    const codes = generateUniqueCodes(0);
    expect(codes).toHaveLength(0);
  });
});
