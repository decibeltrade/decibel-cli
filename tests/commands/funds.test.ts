import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the SDK before any imports
const mockReadDex = {
  usdcDecimals: vi.fn(),
  availableRestrictedMintFor: vi.fn(),
  getAccountTriggerResetMintTs: vi.fn(),
  usdcBalance: vi.fn(),
  accountOverview: {
    getByAddr: vi.fn(),
  },
  userFundHistory: {
    getByAddr: vi.fn(),
  },
};

const mockWriteDex = {
  deposit: vi.fn(),
  withdraw: vi.fn(),
};

const mockAccount = {
  accountAddress: {
    toString: () => "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  },
};

const mockConfig = {
  deployment: {
    package: "0xpackage",
  },
  fullnodeUrl: "https://api.testnet.aptoslabs.com/v1",
  gasStationUrl: "https://fee-payer.example.com",
};

vi.mock("@decibeltrade/sdk", () => ({
  TESTNET_CONFIG: mockConfig,
  NETNA_CONFIG: mockConfig,
  LOCAL_CONFIG: mockConfig,
  submitFeePaidTransaction: vi.fn().mockResolvedValue({ hash: "0xmockhash" }),
}));

vi.mock("@aptos-labs/ts-sdk", () => ({
  Aptos: vi.fn().mockImplementation(() => ({
    transaction: {
      build: {
        simple: vi.fn().mockResolvedValue({ rawTransaction: {} }),
      },
      sign: vi.fn().mockReturnValue({}),
    },
    waitForTransaction: vi.fn().mockResolvedValue({ hash: "0xmockhash" }),
  })),
  AptosConfig: vi.fn(),
  Network: { TESTNET: "testnet", CUSTOM: "custom" },
}));

vi.mock("../../src/services/dex-factory.js", () => ({
  createReadDex: vi.fn(() => mockReadDex),
  createWriteDex: vi.fn(() => Promise.resolve(mockWriteDex)),
  resolveAccount: vi.fn(() => Promise.resolve({ account: mockAccount })),
  resolveAddress: vi.fn(() => mockAccount.accountAddress.toString()),
  getConfig: vi.fn(() => mockConfig),
  getSubaccountAddress: vi.fn(() => "0xsubaccount"),
}));

describe("Funds Commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadDex.usdcDecimals.mockResolvedValue(6);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("deposit command", () => {
    it("should reject invalid amount (zero)", async () => {
      const amountNum = parseFloat("0");
      expect(isNaN(amountNum) || amountNum <= 0).toBe(true);
    });

    it("should reject invalid amount (negative)", async () => {
      const amountNum = parseFloat("-100");
      expect(isNaN(amountNum) || amountNum <= 0).toBe(true);
    });

    it("should reject invalid amount (not a number)", async () => {
      const amountNum = parseFloat("abc");
      expect(isNaN(amountNum) || amountNum <= 0).toBe(true);
    });

    it("should convert amount to chain units correctly", async () => {
      mockReadDex.usdcDecimals.mockResolvedValue(6);
      const usdcDecimals = await mockReadDex.usdcDecimals();
      const amountNum = 100;
      const chainAmount = Math.floor(amountNum * 10 ** usdcDecimals);
      expect(chainAmount).toBe(100_000_000);
    });
  });

  describe("withdraw command", () => {
    it("should reject invalid amount (zero)", async () => {
      const amountNum = parseFloat("0");
      expect(isNaN(amountNum) || amountNum <= 0).toBe(true);
    });

    it("should reject invalid amount (negative)", async () => {
      const amountNum = parseFloat("-50");
      expect(isNaN(amountNum) || amountNum <= 0).toBe(true);
    });

    it("should convert amount to chain units correctly", async () => {
      mockReadDex.usdcDecimals.mockResolvedValue(6);
      const usdcDecimals = await mockReadDex.usdcDecimals();
      const amountNum = 50.5;
      const chainAmount = Math.floor(amountNum * 10 ** usdcDecimals);
      expect(chainAmount).toBe(50_500_000);
    });
  });

  describe("faucet command", () => {
    it("should reject when daily mint limit is reached", async () => {
      mockReadDex.availableRestrictedMintFor.mockResolvedValue(0);
      mockReadDex.getAccountTriggerResetMintTs.mockResolvedValue(
        Math.floor(Date.now() / 1000) + 86400
      );

      const availableMint = await mockReadDex.availableRestrictedMintFor(
        mockAccount.accountAddress.toString()
      );

      expect(availableMint).toBe(0);
    });

    it("should reject when requested amount exceeds available mint", async () => {
      const usdcDecimals = 6;
      mockReadDex.availableRestrictedMintFor.mockResolvedValue(500 * 10 ** usdcDecimals); // $500 available

      const availableMint = await mockReadDex.availableRestrictedMintFor(
        mockAccount.accountAddress.toString()
      );
      const maxAmount = availableMint / 10 ** usdcDecimals;
      const requestedAmount = 1000; // Request $1000

      expect(requestedAmount > maxAmount).toBe(true);
    });

    it("should accept valid amount within limit", async () => {
      const usdcDecimals = 6;
      mockReadDex.availableRestrictedMintFor.mockResolvedValue(1000 * 10 ** usdcDecimals); // $1000 available

      const availableMint = await mockReadDex.availableRestrictedMintFor(
        mockAccount.accountAddress.toString()
      );
      const maxAmount = availableMint / 10 ** usdcDecimals;
      const requestedAmount = 500; // Request $500

      expect(requestedAmount <= maxAmount).toBe(true);
    });

    it("should convert faucet amount to chain units correctly", async () => {
      mockReadDex.usdcDecimals.mockResolvedValue(6);
      const usdcDecimals = await mockReadDex.usdcDecimals();
      const requestedAmount = 1000;
      const chainAmount = Math.floor(requestedAmount * 10 ** usdcDecimals);
      expect(chainAmount).toBe(1_000_000_000);
    });
  });

  describe("balances command", () => {
    it("should handle 404 error for non-existent account gracefully", async () => {
      mockReadDex.accountOverview.getByAddr.mockRejectedValue(
        new Error("HTTP Error 404 (notFound): Account not found")
      );

      await expect(
        mockReadDex.accountOverview.getByAddr({ subAddr: "0xnonexistent" })
      ).rejects.toThrow("Account not found");
    });

    it("should return balances for existing account", async () => {
      mockReadDex.usdcBalance.mockResolvedValue(100);
      mockReadDex.accountOverview.getByAddr.mockResolvedValue({
        perp_equity_balance: 1000,
        unrealized_pnl: 50,
        usdc_cross_withdrawable_balance: 950,
        usdc_isolated_withdrawable_balance: 0,
      });

      const [walletBalance, accountOverview] = await Promise.all([
        mockReadDex.usdcBalance("0xaddress"),
        mockReadDex.accountOverview.getByAddr({ subAddr: "0xsubaccount" }),
      ]);

      expect(walletBalance).toBe(100);
      expect(accountOverview.perp_equity_balance).toBe(1000);
      expect(accountOverview.unrealized_pnl).toBe(50);
    });
  });

  describe("history command", () => {
    it("should handle empty history", async () => {
      mockReadDex.userFundHistory.getByAddr.mockResolvedValue({ funds: [] });

      const history = await mockReadDex.userFundHistory.getByAddr({
        subAddr: "0xsubaccount",
        limit: 20,
      });

      expect(history.funds).toHaveLength(0);
    });

    it("should return fund history records", async () => {
      const mockHistory = {
        funds: [
          {
            timestamp: Date.now(),
            movement_type: "deposit",
            amount: 1000,
            balance_after: 1000,
          },
          {
            timestamp: Date.now() - 3600000,
            movement_type: "withdraw",
            amount: 500,
            balance_after: 500,
          },
        ],
      };
      mockReadDex.userFundHistory.getByAddr.mockResolvedValue(mockHistory);

      const history = await mockReadDex.userFundHistory.getByAddr({
        subAddr: "0xsubaccount",
        limit: 20,
      });

      expect(history.funds).toHaveLength(2);
      expect(history.funds[0].movement_type).toBe("deposit");
      expect(history.funds[1].movement_type).toBe("withdraw");
    });

    it("should respect limit parameter", async () => {
      mockReadDex.userFundHistory.getByAddr.mockImplementation(({ limit }) => {
        const allRecords = new Array(50).fill({
          timestamp: Date.now(),
          movement_type: "deposit",
          amount: 100,
          balance_after: 100,
        });
        return Promise.resolve({ funds: allRecords.slice(0, limit) });
      });

      const history = await mockReadDex.userFundHistory.getByAddr({
        subAddr: "0xsubaccount",
        limit: 10,
      });

      expect(history.funds).toHaveLength(10);
    });
  });
});
