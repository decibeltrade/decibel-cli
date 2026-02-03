import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import chalk from "chalk";

import {
  formatNumber,
  formatPrice,
  formatPnL,
  formatPercent,
  formatSide,
  formatAddress,
  formatTimestamp,
  createDepthBar,
  formatOutput,
  createTable,
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

  describe("formatPrice", () => {
    it("should format price with $ prefix", () => {
      expect(formatPrice(1234.56)).toBe("$1234.56");
    });

    it("should format price with custom decimals", () => {
      expect(formatPrice(1234.5678, 4)).toBe("$1234.5678");
    });

    it("should format zero price", () => {
      expect(formatPrice(0)).toBe("$0.00");
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
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const data = { foo: "bar", num: 123 };

      formatOutput(data, () => {}, { json: true });

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
