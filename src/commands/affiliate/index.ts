import { Command } from "commander";
import { readFileSync } from "fs";

import { type AddressType, resolveAptosAddress } from "../../utils/address.js";
import { createClickHouseClient, getClickHouseUrl } from "../../utils/clickhouse.js";
import {
  createTable,
  formatAddress,
  printError,
  printInfo,
  printSuccess,
  printWarning,
} from "../../utils/output.js";
import { generateUniqueCodes } from "../../utils/referral-code.js";

interface AffiliateEntry {
  name: string;
  sourceAddress: string;
  aptosAddress: string;
  addressType: AddressType;
  code: string;
}

interface CollisionRow {
  referral_code: string;
  owner_account: string;
  max_usage: number;
  is_affiliate: boolean;
  times_redeemed: number;
}

interface VerifyRow {
  referral_code: string;
  owner_account: string;
  max_usage: number;
  is_affiliate: boolean;
}

/**
 * Parse a CSV file of name,address pairs.
 * Skips header row if detected (first column matches common header names).
 */
function parseCsvFile(filePath: string): Array<{ name: string; address: string }> {
  const content = readFileSync(filePath, "utf-8");
  const lines = content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    throw new Error("CSV file is empty");
  }

  const entries: Array<{ name: string; address: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Split on comma or tab
    const parts = line.split(/[,\t]/).map((p) => p.trim());
    const name = parts[0];
    const address = parts[1];

    if (!name || !address) {
      throw new Error(`Line ${i + 1}: expected "name,address", got "${line}"`);
    }

    // Skip header row
    if (i === 0 && /^(name|affiliate|kol)/i.test(name)) {
      continue;
    }

    entries.push({ name, address });
  }

  return entries;
}

/**
 * Check for collisions against ClickHouse and return collision info.
 * Checks both referral codes and owner addresses (with is_affiliate = true).
 */
async function checkCollisions(
  clickhouseUrl: string,
  codes: string[],
  aptosAddresses: string[],
): Promise<CollisionRow[]> {
  const client = createClickHouseClient(clickhouseUrl);
  try {
    const codeList = codes.map((c) => `'${c}'`).join(", ");
    const addrList = aptosAddresses.map((a) => `'${a}'`).join(", ");

    const result = await client.query({
      query: `
        SELECT
          m.referral_code,
          m.owner_account,
          m.max_usage,
          m.is_affiliate,
          count(r.referral_code) AS times_redeemed
        FROM managed_referral_codes AS m FINAL
        LEFT JOIN referral_redemptions AS r FINAL ON m.referral_code = r.referral_code
        WHERE m.referral_code IN (${codeList})
           OR (m.owner_account IN (${addrList}) AND m.is_affiliate = true)
        GROUP BY m.referral_code, m.owner_account, m.max_usage, m.is_affiliate
      `,
      format: "JSONEachRow",
    });
    return await result.json<CollisionRow>();
  } finally {
    await client.close();
  }
}

/**
 * Check if a single referral code already exists in ClickHouse.
 */
async function codeExistsInClickHouse(clickhouseUrl: string, code: string): Promise<boolean> {
  const client = createClickHouseClient(clickhouseUrl);
  try {
    const result = await client.query({
      query: `SELECT 1 FROM managed_referral_codes FINAL WHERE referral_code = '${code}' LIMIT 1`,
      format: "JSONEachRow",
    });
    const rows = await result.json<Record<string, unknown>>();
    return rows.length > 0;
  } finally {
    await client.close();
  }
}

/**
 * Insert affiliate entries into ClickHouse one at a time.
 * Returns arrays of successfully inserted and failed entries.
 */
async function insertEntries(
  clickhouseUrl: string,
  entries: AffiliateEntry[],
  maxUsage: number,
): Promise<{
  inserted: AffiliateEntry[];
  failed: Array<{ entry: AffiliateEntry; error: string }>;
}> {
  const inserted: AffiliateEntry[] = [];
  const failed: Array<{ entry: AffiliateEntry; error: string }> = [];

  for (const entry of entries) {
    const client = createClickHouseClient(clickhouseUrl);
    try {
      await client.command({
        query: `INSERT INTO managed_referral_codes (referral_code, owner_account, max_usage, is_affiliate, source)
                VALUES ('${entry.code}', '${entry.aptosAddress}', ${maxUsage}, true, 'admin')`,
      });
      inserted.push(entry);
    } catch (err) {
      failed.push({ entry, error: err instanceof Error ? err.message : String(err) });
    } finally {
      await client.close();
    }
  }

  return { inserted, failed };
}

/**
 * Verify inserted entries exist in ClickHouse.
 * Returns entries that are missing or have mismatched fields.
 */
async function verifyInsertions(
  clickhouseUrl: string,
  entries: AffiliateEntry[],
  maxUsage: number,
): Promise<{
  verified: AffiliateEntry[];
  missing: AffiliateEntry[];
  mismatched: Array<{ entry: AffiliateEntry; actual: VerifyRow }>;
}> {
  const client = createClickHouseClient(clickhouseUrl);
  try {
    const codeList = entries.map((e) => `'${e.code}'`).join(", ");
    const result = await client.query({
      query: `SELECT referral_code, owner_account, max_usage, is_affiliate
              FROM managed_referral_codes FINAL
              WHERE referral_code IN (${codeList})`,
      format: "JSONEachRow",
    });
    const rows = await result.json<VerifyRow>();
    const rowMap = new Map(rows.map((r) => [r.referral_code, r]));

    const verified: AffiliateEntry[] = [];
    const missing: AffiliateEntry[] = [];
    const mismatched: Array<{ entry: AffiliateEntry; actual: VerifyRow }> = [];

    for (const entry of entries) {
      const row = rowMap.get(entry.code);
      if (!row) {
        missing.push(entry);
      } else if (
        row.owner_account !== entry.aptosAddress ||
        !row.is_affiliate ||
        row.max_usage !== maxUsage
      ) {
        mismatched.push({ entry, actual: row });
      } else {
        verified.push(entry);
      }
    }

    return { verified, missing, mismatched };
  } finally {
    await client.close();
  }
}

/**
 * Print a runbook entry for a skipped address that already has an affiliate code.
 */
function printAddressCollisionRunbook(
  name: string,
  sourceAddress: string,
  collision: CollisionRow,
): void {
  const maxedOut = collision.times_redeemed >= collision.max_usage;
  printWarning(`Skipped: ${name} (${formatAddress(sourceAddress, 8)})`);
  console.log(
    `  Existing code: ${collision.referral_code} | Usage: ${collision.times_redeemed}/${collision.max_usage}${maxedOut ? " (maxed out)" : ""}`,
  );
  if (maxedOut) {
    const newMax = collision.max_usage + 200;
    console.log(`  → To increase limit, run:`);
    console.log(
      `    INSERT INTO managed_referral_codes (referral_code, owner_account, max_usage, is_affiliate, source)`,
    );
    console.log(
      `    VALUES ('${collision.referral_code}', '${collision.owner_account}', ${newMax}, true, 'admin');`,
    );
  } else {
    console.log(`  → Code is still active, no action needed.`);
  }
  console.log();
}

/**
 * Print reconciliation SQL for entries that failed verification.
 */
function printReconciliation(
  missing: AffiliateEntry[],
  mismatched: Array<{ entry: AffiliateEntry; actual: VerifyRow }>,
  maxUsage: number,
): void {
  if (missing.length > 0) {
    console.log();
    printError(`${missing.length} entry(ies) missing after insert. Re-insert manually:`);
    console.log();
    for (const entry of missing) {
      console.log(
        `-- ${entry.name} (${entry.addressType}: ${formatAddress(entry.sourceAddress, 10)})`,
      );
      console.log(
        `INSERT INTO managed_referral_codes (referral_code, owner_account, max_usage, is_affiliate, source)`,
      );
      console.log(`VALUES ('${entry.code}', '${entry.aptosAddress}', ${maxUsage}, true, 'admin');`);
      console.log();
    }
  }

  if (mismatched.length > 0) {
    console.log();
    printError(`${mismatched.length} entry(ies) have mismatched fields. Review and fix:`);
    console.log();
    for (const { entry, actual } of mismatched) {
      printWarning(`${entry.name}: code ${entry.code}`);
      console.log(
        `  Expected: owner=${formatAddress(entry.aptosAddress, 8)}, max_usage=${maxUsage}, is_affiliate=true`,
      );
      console.log(
        `  Actual:   owner=${formatAddress(actual.owner_account, 8)}, max_usage=${actual.max_usage}, is_affiliate=${actual.is_affiliate}`,
      );
      console.log(`  → To fix, re-insert with correct values:`);
      console.log(
        `    INSERT INTO managed_referral_codes (referral_code, owner_account, max_usage, is_affiliate, source)`,
      );
      console.log(
        `    VALUES ('${entry.code}', '${entry.aptosAddress}', ${maxUsage}, true, 'admin');`,
      );
      console.log();
    }
  }
}

export function createAffiliateCommand(): Command {
  const affiliate = new Command("affiliate").description("Manage affiliate referral codes");

  affiliate
    .command("create-codes")
    .description("Generate affiliate referral codes and output SQL for ClickHouse insertion")
    .option("--file <path>", "CSV file with name,address columns (comma or tab separated)")
    .option("--name <name>", "Affiliate name (single mode)")
    .option(
      "--address <address>",
      "Wallet address: ETH (0x + 40 hex), Solana (base58), or Aptos (0x + 64 hex)",
    )
    .option("--max-usage <n>", "Max usage per code", "100")
    .option(
      "--clickhouse-url <url>",
      "ClickHouse connection URL (or set DECIBEL_CLICKHOUSE_URL env var)",
    )
    .option("--execute", "Insert codes into ClickHouse (requires --clickhouse-url)")
    .action(
      async (options: {
        file?: string;
        name?: string;
        address?: string;
        maxUsage: string;
        clickhouseUrl?: string;
        execute?: boolean;
      }) => {
        try {
          // Parse input
          let inputs: Array<{ name: string; address: string }>;

          if (options.file) {
            inputs = parseCsvFile(options.file);
          } else if (options.name && options.address) {
            inputs = [{ name: options.name, address: options.address }];
          } else {
            printError("Provide either --file <csv> or both --name and --address");
            process.exit(1);
          }

          if (inputs.length === 0) {
            printError("No entries found in input");
            process.exit(1);
          }

          const maxUsage = parseInt(options.maxUsage, 10);
          if (isNaN(maxUsage) || maxUsage <= 0) {
            printError("--max-usage must be a positive integer");
            process.exit(1);
          }

          const clickhouseUrl = getClickHouseUrl(options.clickhouseUrl);
          if (options.execute && !clickhouseUrl) {
            printError("--execute requires --clickhouse-url or DECIBEL_CLICKHOUSE_URL env var");
            process.exit(1);
          }

          // Resolve addresses and generate codes
          const codes = generateUniqueCodes(inputs.length);
          let entries: AffiliateEntry[] = inputs.map((input, i) => {
            const { aptosAddress, addressType } = resolveAptosAddress(input.address);
            return {
              name: input.name,
              sourceAddress: input.address,
              aptosAddress,
              addressType,
              code: codes[i],
            };
          });

          // Check collisions if ClickHouse URL is available
          if (clickhouseUrl) {
            printInfo("Checking collisions against ClickHouse...\n");

            const collisions = await checkCollisions(
              clickhouseUrl,
              entries.map((e) => e.code),
              entries.map((e) => e.aptosAddress),
            );

            if (collisions.length > 0) {
              // Build lookup maps
              const collidedCodes = new Set(collisions.map((c) => c.referral_code));
              const collidedAddresses = new Map(
                collisions.filter((c) => c.is_affiliate).map((c) => [c.owner_account, c]),
              );

              // Handle address collisions: skip entries and print runbook
              const kept: AffiliateEntry[] = [];
              for (const entry of entries) {
                const addrCollision = collidedAddresses.get(entry.aptosAddress);
                if (addrCollision) {
                  printAddressCollisionRunbook(entry.name, entry.sourceAddress, addrCollision);
                } else {
                  kept.push(entry);
                }
              }

              entries = kept;

              // Handle code collisions: regenerate and re-verify against ClickHouse
              if (entries.length > 0) {
                const existingCodes = collidedCodes;
                for (const entry of entries) {
                  const MAX_RETRIES = 10;
                  let retries = 0;
                  while (existingCodes.has(entry.code)) {
                    entry.code = generateUniqueCodes(1)[0];
                    retries++;
                  }
                  // Verify the new code doesn't exist in ClickHouse either
                  while (await codeExistsInClickHouse(clickhouseUrl, entry.code)) {
                    if (++retries > MAX_RETRIES) {
                      throw new Error(
                        `Failed to generate a unique code after ${MAX_RETRIES} attempts`,
                      );
                    }
                    printWarning(
                      `Code ${entry.code} already exists in ClickHouse, regenerating...`,
                    );
                    entry.code = generateUniqueCodes(1)[0];
                  }
                  existingCodes.add(entry.code);
                }
              }
            }

            if (entries.length === 0) {
              printInfo("All entries already have affiliate codes. Nothing to insert.");
              return;
            }

            printInfo(`Collision check passed for ${entries.length} entry(ies)\n`);
          }

          // Print summary table
          printInfo(`Generated ${entries.length} affiliate code(s)\n`);
          const table = createTable(["Name", "Source Address", "Type", "Aptos Address", "Code"]);
          for (const e of entries) {
            table.push([
              e.name,
              formatAddress(e.sourceAddress, 8),
              e.addressType,
              formatAddress(e.aptosAddress, 8),
              e.code,
            ]);
          }
          console.log(table.toString());
          console.log();

          // Execute mode: insert into ClickHouse and verify
          if (options.execute && clickhouseUrl) {
            printInfo("Inserting into ClickHouse...\n");

            const { inserted, failed } = await insertEntries(clickhouseUrl, entries, maxUsage);

            if (failed.length > 0) {
              printError(`${failed.length} insert(s) failed:`);
              for (const { entry, error } of failed) {
                printError(`  ${entry.name} (${entry.code}): ${error}`);
              }
              console.log();
            }

            if (inserted.length > 0) {
              printInfo(`Inserted ${inserted.length} code(s). Verifying...\n`);

              // Retry verification with delay — ClickHouse Cloud's async merges
              // mean recently inserted rows may not be visible via FINAL immediately.
              const MAX_VERIFY_ATTEMPTS = 3;
              const VERIFY_DELAY_MS = 2000;
              let verifyResult = await verifyInsertions(clickhouseUrl, inserted, maxUsage);

              for (let attempt = 1; attempt < MAX_VERIFY_ATTEMPTS; attempt++) {
                if (verifyResult.verified.length === inserted.length) break;
                printInfo(
                  `Waiting for ClickHouse replication (attempt ${attempt + 1}/${MAX_VERIFY_ATTEMPTS})...`,
                );
                await new Promise((resolve) => setTimeout(resolve, VERIFY_DELAY_MS));
                verifyResult = await verifyInsertions(clickhouseUrl, inserted, maxUsage);
              }

              const { verified, missing, mismatched } = verifyResult;
              if (verified.length === inserted.length) {
                printSuccess(`All ${verified.length} code(s) verified successfully.`);
              } else {
                printWarning(`Verified ${verified.length}/${inserted.length}. Issues found:`);
                printReconciliation(missing, mismatched, maxUsage);
              }
            }

            // Always output re-insert SQL for failed entries
            if (failed.length > 0) {
              console.log();
              printInfo("Retry SQL for failed inserts:");
              console.log();
              for (const { entry } of failed) {
                console.log(
                  `INSERT INTO managed_referral_codes (referral_code, owner_account, max_usage, is_affiliate, source)`,
                );
                console.log(
                  `VALUES ('${entry.code}', '${entry.aptosAddress}', ${maxUsage}, true, 'admin');`,
                );
              }
            }
            return;
          }

          // Non-execute mode: output SQL for manual execution
          const codeList = entries.map((e) => `'${e.code}'`).join(", ");
          const addrList = entries.map((e) => `'${e.aptosAddress}'`).join(",\n     ");

          if (!clickhouseUrl) {
            console.log("-- Step 1: Collision check (should return 0 rows)");
            console.log(`SELECT referral_code, owner_account, is_affiliate, source
FROM managed_referral_codes FINAL
WHERE referral_code IN (${codeList})
   OR (owner_account IN (
     ${addrList}
   ) AND is_affiliate = true);`);
            console.log();
          }

          console.log(
            clickhouseUrl ? "-- Insert affiliate codes" : "-- Step 2: Insert affiliate codes",
          );
          for (const e of entries) {
            console.log(`-- ${e.name} (${e.addressType}: ${formatAddress(e.sourceAddress, 10)})`);
            console.log(
              `INSERT INTO managed_referral_codes (referral_code, owner_account, max_usage, is_affiliate, source)`,
            );
            console.log(`VALUES ('${e.code}', '${e.aptosAddress}', ${maxUsage}, true, 'admin');`);
            console.log();
          }

          console.log(clickhouseUrl ? "-- Verify insertion" : "-- Step 3: Verify insertion");
          console.log(
            `SELECT referral_code, owner_account, is_affiliate, source, created_at
FROM managed_referral_codes FINAL
WHERE referral_code IN (${codeList});`,
          );
        } catch (error) {
          printError(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      },
    );

  return affiliate;
}
