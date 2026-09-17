import chalk from "chalk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createDepthBar,
  createTable,
  formatAddress,
  formatAmount,
  formatNumber,
  formatOutput,
  formatPercent,
  formatPnL,
  formatPrice,
  formatSide,
  formatTimestamp,
  formatUsd,
  marketLabel,
} from "../../src/utils/output.js";

// Disable chalk colors for consistent test output
beforeEach(() => {
  chalk.level = 0;
});

afterEach(() => {
  chalk.level = 3;
});

describe("output utilities", () => {
  describe("formatNumber", () => {
    it("should format number with default 2 decimals", () => {
      expect(formatNumber(123.456)).toBe("123.46");
    });

    it("should format number with custom decimals", () => {
      expect(formatNumber(123.456789, 4)).toBe("123.4568");
    });

    it("should format zero", () => {
      expect(formatNumber(0)).toBe("0.00");
    });

    it("should format negative number", () => {
      expect(formatNumber(-50.123)).toBe("-50.12");
    });

    it("should show sign when option enabled", () => {
      expect(formatNumber(50.12, 2, { showSign: true })).toBe("+50.12");
    });

    it("should not show sign for negative numbers with showSign", () => {
      expect(formatNumber(-50.12, 2, { showSign: true })).toBe("-50.12");
    });

    it("should not show sign for zero with showSign", () => {
      expect(formatNumber(0, 2, { showSign: true })).toBe("0.00");
    });
  });

  describe("formatAmount", () => {
    it("trims trailing zeros left by toFixed", () => {
      expect(formatAmount(0.001, 8)).toBe("0.001");
      expect(formatAmount(10, 8)).toBe("10");
      expect(formatAmount(0.1, 8)).toBe("0.1");
    });

    it("keeps every significant digit at high precision", () => {
      expect(formatAmount(1e-7, 8)).toBe("0.0000001");
      expect(formatAmount(0.0001, 6)).toBe("0.0001");
    });

    it("does not strip zeros from whole numbers", () => {
      expect(formatAmount(100, 0)).toBe("100");
      expect(formatAmount(1000, 2)).toBe("1000");
      expect(formatAmount(10500, 4)).toBe("10500");
    });

    it("handles zero and negatives", () => {
      expect(formatAmount(0, 6)).toBe("0");
      expect(formatAmount(-0.5, 4)).toBe("-0.5");
    });

    it("rounds at the given precision", () => {
      expect(formatAmount(0.123456789, 4)).toBe("0.1235");
    });
  });

  // Ported from the web app's NumberFormatter.price: five significant digits,
  // capped by the market's price decimals. A fixed 2 decimals rendered every
  // sub-cent asset as $0.00.
  describe("formatPrice", () => {
    it("drops decimals as the integer part grows", () => {
      expect(formatPrice(12345.6789)).toBe("$12346");
      expect(formatPrice(1234.5678)).toBe("$1234.6");
      expect(formatPrice(12.34567)).toBe("$12.346");
      expect(formatPrice(1.2345678)).toBe("$1.2346");
    });

    // Below 1 the leading "0" consumes one of the five significant digits, so
    // four remain after the leading zeros — same as the web app.
    it("keeps sub-cent prices legible instead of rounding them to zero", () => {
      expect(formatPrice(0.0043)).toBe("$0.004300");
      expect(formatPrice(0.0071234)).toBe("$0.007123");
      expect(formatPrice(0.00001234)).toBe("$0.00001234");
    });

    it("caps precision at the market's price decimals", () => {
      expect(formatPrice(0.000012345678, { pxDecimals: 6 })).toBe("$0.000012");
      expect(formatPrice(0.000012345678, { pxDecimals: 9 })).toBe("$0.00001235");
    });

    it("floors a value too small to show at the smallest representable price", () => {
      expect(formatPrice(0.0000002, { pxDecimals: 3 })).toBe("$0.001");
      expect(formatPrice(-0.0000002, { pxDecimals: 3 })).toBe("-$0.001");
    });

    it("formats zero at the market's precision", () => {
      expect(formatPrice(0)).toBe("$0.0000");
      expect(formatPrice(0, { pxDecimals: 2 })).toBe("$0.00");
      expect(formatPrice(0, { pxDecimals: 0 })).toBe("$0");
    });

    it("can omit the currency symbol", () => {
      expect(formatPrice(12.34567, { symbol: false })).toBe("12.346");
    });

    it("keeps negatives signed outside the symbol", () => {
      expect(formatPrice(-12.34567)).toBe("-$12.346");
    });

    it("passes non-finite values through", () => {
      expect(formatPrice(Number.NaN)).toBe("NaN");
      expect(formatPrice(Number.POSITIVE_INFINITY)).toBe("Infinity");
    });
  });

  // Account endpoints identify markets only by address, which is unreadable in
  // a table; an unlisted market still shows something identifiable.
  describe("marketLabel", () => {
    const names = new Map([["0xbtc", "BTC/USD"]]);

    it("resolves a known market to its symbol, case-insensitively", () => {
      expect(marketLabel("0xbtc", names)).toBe("BTC/USD");
      expect(marketLabel("0xBTC", names)).toBe("BTC/USD");
    });

    it("falls back to a truncated address for an unlisted market", () => {
      expect(marketLabel("0xdeadbeefdeadbeefdeadbeefdeadbeef", names)).toContain("...");
    });

    it("degrades rather than throwing when no map was built", () => {
      expect(marketLabel("0xbtc")).toBe("0xbtc");
    });
  });

  describe("formatUsd", () => {
    it("keeps two decimals for account values", () => {
      expect(formatUsd(1234.56)).toBe("$1234.56");
      expect(formatUsd(0)).toBe("$0.00");
    });
  });

  describe("formatPnL", () => {
    it("should format positive PnL with + sign", () => {
      const result = formatPnL(100.5);
      expect(result).toContain("+100.50");
    });

    it("should format negative PnL", () => {
      const result = formatPnL(-50.25);
      expect(result).toContain("-50.25");
    });

    it("should format zero PnL", () => {
      const result = formatPnL(0);
      // Zero is not positive so doesn't get + sign
      expect(result).toBe("0.00");
    });

    it("should respect custom decimals", () => {
      const result = formatPnL(100.123, 3);
      expect(result).toContain("+100.123");
    });
  });

  describe("formatPercent", () => {
    it("should format decimal as percentage", () => {
      expect(formatPercent(0.15)).toBe("15.00%");
    });

    it("should format small decimal", () => {
      expect(formatPercent(0.001)).toBe("0.10%");
    });

    it("should format 100%", () => {
      expect(formatPercent(1)).toBe("100.00%");
    });

    it("should format with custom decimals", () => {
      expect(formatPercent(0.15678, 3)).toBe("15.678%");
    });
  });

  describe("formatSide", () => {
    it("should format buy as uppercase", () => {
      const result = formatSide("buy");
      expect(result).toBe("BUY");
    });

    it("should format sell as uppercase", () => {
      const result = formatSide("sell");
      expect(result).toBe("SELL");
    });

    it("should format long as uppercase", () => {
      const result = formatSide("long");
      expect(result).toBe("LONG");
    });

    it("should format short as uppercase", () => {
      const result = formatSide("short");
      expect(result).toBe("SHORT");
    });

    it("should handle mixed case input", () => {
      expect(formatSide("BUY")).toBe("BUY");
      expect(formatSide("Long")).toBe("LONG");
    });
  });

  describe("formatAddress", () => {
    it("should truncate long address", () => {
      const address = "0x1234567890abcdef1234567890abcdef12345678";
      const result = formatAddress(address);
      expect(result).toBe("0x123456...345678");
    });

    it("should not truncate short address", () => {
      const address = "0x1234567890";
      const result = formatAddress(address);
      expect(result).toBe("0x1234567890");
    });

    it("should respect custom char count", () => {
      const address = "0x1234567890abcdef1234567890abcdef12345678";
      const result = formatAddress(address, 4);
      expect(result).toBe("0x1234...5678");
    });
  });

  describe("formatTimestamp", () => {
    it("should format numeric timestamp", () => {
      const timestamp = 1704067200000; // Jan 1, 2024 00:00:00 UTC
      const result = formatTimestamp(timestamp);
      expect(result).toBeTruthy();
    });

    it("should format string timestamp", () => {
      const result = formatTimestamp("2024-01-01T00:00:00Z");
      expect(result).toBeTruthy();
    });

    it("should format Date object", () => {
      const date = new Date("2024-01-01T00:00:00Z");
      const result = formatTimestamp(date);
      expect(result).toBeTruthy();
    });
  });

  describe("createDepthBar", () => {
    it("should create bid bar (green, right-aligned)", () => {
      const result = createDepthBar(50, 100, 10, true);
      expect(result.length).toBe(10);
    });

    it("should create ask bar (red, left-aligned)", () => {
      const result = createDepthBar(50, 100, 10, false);
      expect(result.length).toBe(10);
    });

    it("should handle full bar", () => {
      const result = createDepthBar(100, 100, 10, true);
      expect(result.length).toBe(10);
    });

    it("should handle empty bar", () => {
      const result = createDepthBar(0, 100, 10, true);
      expect(result.length).toBe(10);
    });

    it("should use default width of 20", () => {
      const result = createDepthBar(50, 100);
      expect(result.length).toBe(20);
    });
  });

  describe("formatOutput", () => {
    it("should output JSON when json option is true", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {
        /* empty */
      });
      const data = { foo: "bar", num: 123 };

      formatOutput(
        data,
        () => {
          /* empty */
        },
        { json: true },
      );

      expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(data, null, 2));
      consoleSpy.mockRestore();
    });

    it("should call table formatter when json option is false", () => {
      const tableFormatter = vi.fn();
      const data = { foo: "bar" };

      formatOutput(data, tableFormatter, { json: false });

      expect(tableFormatter).toHaveBeenCalledWith(data);
    });

    it("should call table formatter when json option is undefined", () => {
      const tableFormatter = vi.fn();
      const data = { foo: "bar" };

      formatOutput(data, tableFormatter, {});

      expect(tableFormatter).toHaveBeenCalledWith(data);
    });
  });

  describe("createTable", () => {
    it("should create table with headers", () => {
      const table = createTable(["Col1", "Col2", "Col3"]);
      expect(table).toBeDefined();
    });

    it("should accept compact option", () => {
      const table = createTable(["Col1"], { compact: true });
      expect(table).toBeDefined();
    });

    it("should allow pushing rows", () => {
      const table = createTable(["Name", "Value"]);
      table.push(["foo", "bar"]);
      const output = table.toString();
      expect(output).toContain("foo");
      expect(output).toContain("bar");
    });
  });
});
