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

interface ExistingCodeRow {
  referral_code: string;
  owner_account: string;
  max_usage: number;
  is_affiliate: boolean;
  times_redeemed: number;
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
    if (i === 0 && /^(name|affiliate|kol|builder)/i.test(name)) {
      continue;
    }

    entries.push({ name, address });
  }

  return entries;
}

/**
 * Check for collisions against ClickHouse and return collision info.
 * When checkAddressCollisions is true, also checks owner addresses with is_affiliate = true.
 */
async function checkCollisions(
  clickhouseUrl: string,
  codes: string[],
  aptosAddresses: string[],
  checkAddressCollisions: boolean,
): Promise<CollisionRow[]> {
  const client = createClickHouseClient(clickhouseUrl);
  try {
    const codeList = codes.map((c) => `'${c}'`).join(", ");
    const addrList = aptosAddresses.map((a) => `'${a}'`).join(", ");

    const whereClause = checkAddressCollisions
      ? `WHERE m.referral_code IN (${codeList})
           OR (m.owner_account IN (${addrList}) AND m.is_affiliate = true)`
      : `WHERE m.referral_code IN (${codeList})`;

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
        ${whereClause}
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
 * Insert entries into ClickHouse one at a time.
 * Returns arrays of successfully inserted and failed entries.
 */
async function insertEntries(
  clickhouseUrl: string,
  entries: AffiliateEntry[],
  maxUsage: number,
  isAffiliate: boolean,
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
                VALUES ('${entry.code}', '${entry.aptosAddress}', ${maxUsage}, ${isAffiliate}, 'admin')`,
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
  isAffiliate: boolean,
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
        row.is_affiliate !== isAffiliate ||
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
  isAffiliate: boolean,
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
      console.log(
        `VALUES ('${entry.code}', '${entry.aptosAddress}', ${maxUsage}, ${isAffiliate}, 'admin');`,
      );
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
        `  Expected: owner=${formatAddress(entry.aptosAddress, 8)}, max_usage=${maxUsage}, is_affiliate=${isAffiliate}`,
      );
      console.log(
        `  Actual:   owner=${formatAddress(actual.owner_account, 8)}, max_usage=${actual.max_usage}, is_affiliate=${actual.is_affiliate}`,
      );
      console.log(`  → To fix, re-insert with correct values:`);
      console.log(
        `    INSERT INTO managed_referral_codes (referral_code, owner_account, max_usage, is_affiliate, source)`,
      );
      console.log(
        `    VALUES ('${entry.code}', '${entry.aptosAddress}', ${maxUsage}, ${isAffiliate}, 'admin');`,
      );
      console.log();
    }
  }
}

/**
 * Look up existing codes by referral code or owner address.
 */
async function lookupExistingCodes(
  clickhouseUrl: string,
  options: { code?: string; address?: string },
): Promise<ExistingCodeRow[]> {
  if (!options.code && !options.address) {
    throw new Error("lookupExistingCodes requires either code or address");
  }
  const client = createClickHouseClient(clickhouseUrl);
  try {
    const whereClause = options.code
      ? `WHERE m.referral_code = '${options.code}'`
      : `WHERE m.owner_account = '${options.address}'`;

    // Filter redemptions subquery to only the codes we're looking up,
    // avoiding a full-table scan on referral_redemptions.
    const redemptionFilter = options.code
      ? `WHERE referral_code = '${options.code}'`
      : `WHERE referral_code IN (
            SELECT referral_code FROM managed_referral_codes FINAL
            WHERE owner_account = '${options.address}'
          )`;

    const result = await client.query({
      query: `
        SELECT
          m.referral_code,
          m.owner_account,
          m.max_usage,
          m.is_affiliate,
          ifNull(rd.usage_count, 0) AS times_redeemed
        FROM managed_referral_codes AS m FINAL
        LEFT JOIN (
          SELECT referral_code, count() AS usage_count
          FROM referral_redemptions FINAL
          ${redemptionFilter}
          GROUP BY referral_code
        ) AS rd ON m.referral_code = rd.referral_code
        ${whereClause}
      `,
      format: "JSONEachRow",
    });
    return await result.json<ExistingCodeRow>();
  } finally {
    await client.close();
  }
}

/**
 * Re-insert codes with updated max_usage into ClickHouse.
 */
async function updateMaxUsage(
  clickhouseUrl: string,
  rows: ExistingCodeRow[],
  newMaxUsage: number,
): Promise<{
  updated: ExistingCodeRow[];
  failed: Array<{ row: ExistingCodeRow; error: string }>;
}> {
  const updated: ExistingCodeRow[] = [];
  const failed: Array<{ row: ExistingCodeRow; error: string }> = [];

  for (const row of rows) {
    const client = createClickHouseClient(clickhouseUrl);
    try {
      await client.command({
        query: `INSERT INTO managed_referral_codes (referral_code, owner_account, max_usage, is_affiliate, source)
                VALUES ('${row.referral_code}', '${row.owner_account}', ${newMaxUsage}, ${row.is_affiliate}, 'admin')`,
      });
      updated.push(row);
    } catch (err) {
      failed.push({ row, error: err instanceof Error ? err.message : String(err) });
    } finally {
      await client.close();
    }
  }

  return { updated, failed };
}

export function createAffiliateCommand(): Command {
  const affiliate = new Command("affiliate").description(
    "Manage affiliate and builder referral codes",
  );

  affiliate
    .command("create-codes")
    .description("Generate referral codes and output SQL for ClickHouse insertion")
    .option("--file <path>", "CSV file with name,address columns (comma or tab separated)")
    .option("--name <name>", "Name (single mode)")
    .option(
      "--address <address>",
      "Wallet address: ETH (0x + 40 hex), Solana (base58), or Aptos (0x + 64 hex)",
    )
    .option("--builder", "Create non-affiliate builder codes (is_affiliate=false)")
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
        builder?: boolean;
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

          const isAffiliate = !options.builder;
          const codeType = isAffiliate ? "affiliate" : "builder";

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
              isAffiliate,
            );

            if (collisions.length > 0) {
              // Build lookup maps
              const collidedCodes = new Set(collisions.map((c) => c.referral_code));
              const collidedAddresses = new Map(
                collisions.filter((c) => c.is_affiliate).map((c) => [c.owner_account, c]),
              );

              // Handle address collisions (affiliate mode only): skip entries and print runbook
              if (isAffiliate) {
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
              }

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
              printInfo("All entries already have codes. Nothing to insert.");
              process.exit(0);
            }

            printInfo(`Collision check passed for ${entries.length} entry(ies)\n`);
          }

          // Print summary table
          printInfo(`Generated ${entries.length} ${codeType} code(s)\n`);
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

            const { inserted, failed } = await insertEntries(
              clickhouseUrl,
              entries,
              maxUsage,
              isAffiliate,
            );

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
              let verifyResult = await verifyInsertions(
                clickhouseUrl,
                inserted,
                maxUsage,
                isAffiliate,
              );

              for (let attempt = 1; attempt < MAX_VERIFY_ATTEMPTS; attempt++) {
                if (verifyResult.verified.length === inserted.length) break;
                printInfo(
                  `Waiting for ClickHouse replication (attempt ${attempt + 1}/${MAX_VERIFY_ATTEMPTS})...`,
                );
                await new Promise((resolve) => setTimeout(resolve, VERIFY_DELAY_MS));
                verifyResult = await verifyInsertions(
                  clickhouseUrl,
                  inserted,
                  maxUsage,
                  isAffiliate,
                );
              }

              const { verified, missing, mismatched } = verifyResult;
              if (verified.length === inserted.length) {
                printSuccess(`All ${verified.length} code(s) verified successfully.`);
              } else {
                printWarning(`Verified ${verified.length}/${inserted.length}. Issues found:`);
                printReconciliation(missing, mismatched, maxUsage, isAffiliate);
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
                  `VALUES ('${entry.code}', '${entry.aptosAddress}', ${maxUsage}, ${isAffiliate}, 'admin');`,
                );
              }
            }
            process.exit(0);
          }

          // Non-execute mode: output SQL for manual execution
          const codeList = entries.map((e) => `'${e.code}'`).join(", ");
          const addrList = entries.map((e) => `'${e.aptosAddress}'`).join(",\n     ");

          if (!clickhouseUrl) {
            console.log("-- Step 1: Collision check (should return 0 rows)");
            const collisionWhere = isAffiliate
              ? `WHERE referral_code IN (${codeList})
   OR (owner_account IN (
     ${addrList}
   ) AND is_affiliate = true)`
              : `WHERE referral_code IN (${codeList})`;
            console.log(`SELECT referral_code, owner_account, is_affiliate, source
FROM managed_referral_codes FINAL
${collisionWhere};`);
            console.log();
          }

          console.log(
            clickhouseUrl ? `-- Insert ${codeType} codes` : `-- Step 2: Insert ${codeType} codes`,
          );
          for (const e of entries) {
            console.log(`-- ${e.name} (${e.addressType}: ${formatAddress(e.sourceAddress, 10)})`);
            console.log(
              `INSERT INTO managed_referral_codes (referral_code, owner_account, max_usage, is_affiliate, source)`,
            );
            console.log(
              `VALUES ('${e.code}', '${e.aptosAddress}', ${maxUsage}, ${isAffiliate}, 'admin');`,
            );
            console.log();
          }

          console.log(clickhouseUrl ? "-- Verify insertion" : "-- Step 3: Verify insertion");
          console.log(
            `SELECT referral_code, owner_account, is_affiliate, source, created_at
FROM managed_referral_codes FINAL
WHERE referral_code IN (${codeList});`,
          );
          process.exit(0);
        } catch (error) {
          printError(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      },
    );

  affiliate
    .command("update-max-usage")
    .description("Update max_usage for existing referral codes")
    .option("--code <code>", "Referral code to update")
    .option("--address <address>", "Owner address — updates all codes for this address")
    .option("--max-usage <n>", "New max usage value (required)")
    .option(
      "--clickhouse-url <url>",
      "ClickHouse connection URL (or set DECIBEL_CLICKHOUSE_URL env var)",
    )
    .option("--execute", "Apply update to ClickHouse")
    .action(
      async (options: {
        code?: string;
        address?: string;
        maxUsage?: string;
        clickhouseUrl?: string;
        execute?: boolean;
      }) => {
        try {
          if (!options.code && !options.address) {
            printError("Provide either --code <code> or --address <address>");
            process.exit(1);
          }
          if (options.code && options.address) {
            printError("Provide only one of --code or --address, not both");
            process.exit(1);
          }
          if (options.code && !/^[A-Z0-9]{1,50}$/i.test(options.code)) {
            printError("--code must be alphanumeric (A-Z, 0-9), max 50 characters");
            process.exit(1);
          }
          if (!options.maxUsage) {
            printError("--max-usage is required");
            process.exit(1);
          }

          const newMaxUsage = parseInt(options.maxUsage, 10);
          if (isNaN(newMaxUsage) || newMaxUsage <= 0) {
            printError("--max-usage must be a positive integer");
            process.exit(1);
          }

          const clickhouseUrl = getClickHouseUrl(options.clickhouseUrl);
          if (!clickhouseUrl) {
            printError(
              "ClickHouse URL required. Use --clickhouse-url or set DECIBEL_CLICKHOUSE_URL env var",
            );
            process.exit(1);
          }

          // Resolve address if provided
          const lookupAddress = options.address
            ? resolveAptosAddress(options.address).aptosAddress
            : undefined;

          // Look up existing codes
          printInfo("Looking up existing codes...\n");
          const existingCodes = await lookupExistingCodes(clickhouseUrl, {
            code: options.code,
            address: lookupAddress,
          });

          if (existingCodes.length === 0) {
            printError(
              options.code
                ? `No code found: ${options.code}`
                : `No codes found for address: ${formatAddress(options.address ?? "", 8)}`,
            );
            process.exit(1);
          }

          // Display current state
          printInfo(`Found ${existingCodes.length} code(s):\n`);
          const table = createTable(["Code", "Owner", "Current Max", "Redeemed", "Affiliate"]);
          for (const row of existingCodes) {
            table.push([
              row.referral_code,
              formatAddress(row.owner_account, 8),
              String(row.max_usage),
              String(row.times_redeemed),
              row.is_affiliate ? "yes" : "no",
            ]);
          }
          console.log(table.toString());
          console.log();

          // Validate: new max_usage must be >= times_redeemed
          const belowUsage = existingCodes.filter((r) => newMaxUsage < r.times_redeemed);
          if (belowUsage.length > 0) {
            for (const row of belowUsage) {
              printError(
                `Cannot set max_usage=${newMaxUsage} for ${row.referral_code} — already redeemed ${row.times_redeemed} times`,
              );
            }
            process.exit(1);
          }

          // Check for no-op
          const needsUpdate = existingCodes.filter((r) => r.max_usage !== newMaxUsage);
          if (needsUpdate.length === 0) {
            printInfo("All codes already have the requested max_usage. Nothing to update.");
            process.exit(0);
          }

          printInfo(`Updating ${needsUpdate.length} code(s) to max_usage=${newMaxUsage}\n`);

          if (options.execute) {
            const { updated, failed } = await updateMaxUsage(
              clickhouseUrl,
              needsUpdate,
              newMaxUsage,
            );

            if (failed.length > 0) {
              printError(`${failed.length} update(s) failed:`);
              for (const { row, error } of failed) {
                printError(`  ${row.referral_code}: ${error}`);
              }
              console.log();
            }

            if (updated.length > 0) {
              // Verify updates landed correctly
              printInfo(`Updated ${updated.length} code(s). Verifying...\n`);
              const MAX_VERIFY_ATTEMPTS = 3;
              const VERIFY_DELAY_MS = 2000;

              for (let attempt = 0; attempt < MAX_VERIFY_ATTEMPTS; attempt++) {
                const verifyRows = await lookupExistingCodes(clickhouseUrl, {
                  code: options.code,
                  address: lookupAddress,
                });
                const verifyMap = new Map(verifyRows.map((r) => [r.referral_code, r]));
                const allMatch = updated.every(
                  (r) => verifyMap.get(r.referral_code)?.max_usage === newMaxUsage,
                );
                if (allMatch) {
                  printSuccess(`All ${updated.length} code(s) verified successfully.`);
                  break;
                }
                if (attempt < MAX_VERIFY_ATTEMPTS - 1) {
                  printInfo(
                    `Waiting for ClickHouse replication (attempt ${attempt + 2}/${MAX_VERIFY_ATTEMPTS})...`,
                  );
                  await new Promise((resolve) => setTimeout(resolve, VERIFY_DELAY_MS));
                } else {
                  printWarning(
                    `Verification incomplete after ${MAX_VERIFY_ATTEMPTS} attempts. Run verify SQL manually.`,
                  );
                }
              }
            }

            // Output retry SQL for failed updates
            if (failed.length > 0) {
              console.log();
              printInfo("Retry SQL for failed updates:");
              console.log();
              for (const { row } of failed) {
                console.log(
                  `INSERT INTO managed_referral_codes (referral_code, owner_account, max_usage, is_affiliate, source)`,
                );
                console.log(
                  `VALUES ('${row.referral_code}', '${row.owner_account}', ${newMaxUsage}, ${row.is_affiliate}, 'admin');`,
                );
              }
            }
            process.exit(failed.length > 0 ? 1 : 0);
          }

          // Non-execute mode: output SQL
          console.log("-- Update max_usage (re-insert with new value)");
          for (const row of needsUpdate) {
            console.log(`-- ${row.referral_code}: ${row.max_usage} → ${newMaxUsage}`);
            console.log(
              `INSERT INTO managed_referral_codes (referral_code, owner_account, max_usage, is_affiliate, source)`,
            );
            console.log(
              `VALUES ('${row.referral_code}', '${row.owner_account}', ${newMaxUsage}, ${row.is_affiliate}, 'admin');`,
            );
            console.log();
          }

          console.log("-- Verify update");
          const updateCodeList = needsUpdate.map((r) => `'${r.referral_code}'`).join(", ");
          console.log(
            `SELECT referral_code, owner_account, max_usage, is_affiliate
FROM managed_referral_codes FINAL
WHERE referral_code IN (${updateCodeList});`,
          );
          process.exit(0);
        } catch (error) {
          printError(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
      },
    );

  return affiliate;
}
