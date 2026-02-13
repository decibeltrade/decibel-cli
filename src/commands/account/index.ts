import { Command } from "commander";
import inquirer from "inquirer";

import {
  addAccount,
  getAllAccounts,
  removeAccount,
  setDefaultAccount,
} from "../../storage/accounts.js";
import {
  createTable,
  formatAddress,
  formatOutput,
  printError,
  printSuccess,
  OutputOptions,
} from "../../utils/output.js";
import { isValidAddress, isValidPrivateKey } from "../../utils/encryption.js";
import { createReadDex, getConfig, resolveSubaccountAddress } from "../../services/dex-factory.js";
import { NetworkName } from "../../utils/config.js";

export function createAccountCommand(): Command {
  const account = new Command("account").description("Manage trading accounts");

  // Add account
  account
    .command("add")
    .description("Add a new trading account (interactive)")
    .action(async () => {
      try {
        const answers = await inquirer.prompt([
          {
            type: "input",
            name: "subaccountAddress",
            message: "Subaccount address (hex string starting with 0x):",
            when: (answers) => answers.type === "read-only",
            validate: (input: string) => {
              if (!input) {
                return "Subaccount address is required";
              }
              if (!isValidAddress(input)) {
                return "Invalid address format. Must be a hex string starting with 0x";
              }
              return true;
            },
          },
          {
            type: "list",
            name: "type",
            message: "Account type:",
            choices: [
              { name: "API Wallet (for trading)", value: "api-wallet" },
              { name: "Read-only (for monitoring)", value: "read-only" },
            ],
          },
          {
            type: "password",
            name: "privateKey",
            message: "Private key (hex string starting with 0x):",
            when: (answers) => answers.type === "api-wallet",
            validate: (input: string) => {
              if (!isValidPrivateKey(input)) {
                return "Invalid private key format. Must be a hex string starting with 0x (64 hex characters)";
              }
              return true;
            },
          },
          {
            type: "input",
            name: "alias",
            message: "Account alias (e.g., main, trading, bot):",
            validate: (input: string) => {
              if (!input.trim()) {
                return "Alias is required";
              }
              if (input.length > 32) {
                return "Alias must be 32 characters or less";
              }
              return true;
            },
          },
          {
            type: "confirm",
            name: "isDefault",
            message: "Set as default account?",
            default: true,
          },
        ]);

        const account = await addAccount({
          alias: answers.alias.trim(),
          privateKey: answers.privateKey,
          subaccountAddress: answers.subaccountAddress,
          type: answers.type,
          isDefault: answers.isDefault,
        });

        printSuccess(`Account "${account.alias}" added successfully`);
        console.log(`Address: ${account.address}`);
        console.log(`Type: ${account.type}`);
        if (account.isDefault) {
          console.log("(Set as default)");
        }
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // List accounts
  account
    .command("ls")
    .description("List all accounts")
    .option("--json", "Output in JSON format")
    .action((options: OutputOptions) => {
      try {
        const accounts = getAllAccounts();

        if (accounts.length === 0) {
          if (options.json) {
            console.log("[]");
          } else {
            console.log('No accounts configured. Run "decibel-cli account add" to add one.');
          }
          return;
        }

        formatOutput(
          accounts.map((a) => ({
            alias: a.alias,
            address: a.address,
            type: a.type,
            isDefault: a.isDefault,
          })),
          (data) => {
            const table = createTable(["Alias", "Address", "Type", "Default"]);
            for (const account of data) {
              table.push([
                account.alias,
                formatAddress(account.address),
                account.type,
                account.isDefault ? "*" : "",
              ]);
            }
            console.log(table.toString());
          },
          options
        );
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // Remove account
  account
    .command("remove [alias]")
    .description("Remove an account")
    .option("-y, --yes", "Skip confirmation")
    .action(async (aliasArg: string | undefined, options: { yes?: boolean }) => {
      try {
        const accounts = getAllAccounts();
        if (accounts.length === 0) {
          printError("No accounts to remove");
          process.exit(1);
        }

        let alias = aliasArg;
        if (!alias) {
          const answers = await inquirer.prompt([
            {
              type: "list",
              name: "alias",
              message: "Select account to remove:",
              choices: accounts.map((a) => ({
                name: `${a.alias} (${formatAddress(a.address)}) ${a.isDefault ? "[default]" : ""}`,
                value: a.alias,
              })),
            },
          ]);
          alias = answers.alias;
        }

        if (!options.yes) {
          const confirm = await inquirer.prompt([
            {
              type: "confirm",
              name: "confirm",
              message: `Are you sure you want to remove account "${alias}"?`,
              default: false,
            },
          ]);
          if (!confirm.confirm) {
            console.log("Cancelled");
            return;
          }
        }

        const removed = removeAccount(alias!);
        if (removed) {
          printSuccess(`Account "${alias}" removed`);
        } else {
          printError(`Account "${alias}" not found`);
          process.exit(1);
        }
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // Set default
  account
    .command("set-default [alias]")
    .description("Set the default account")
    .action(async (aliasArg: string | undefined) => {
      try {
        const accounts = getAllAccounts();
        if (accounts.length === 0) {
          printError("No accounts configured");
          process.exit(1);
        }

        let alias = aliasArg;
        if (!alias) {
          const answers = await inquirer.prompt([
            {
              type: "list",
              name: "alias",
              message: "Select default account:",
              choices: accounts.map((a) => ({
                name: `${a.alias} (${formatAddress(a.address)}) ${a.isDefault ? "[current default]" : ""}`,
                value: a.alias,
              })),
            },
          ]);
          alias = answers.alias;
        }

        const account = setDefaultAccount(alias!);
        printSuccess(`"${account.alias}" is now the default account`);
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // Account info (balances, equity)
  account
    .command("info")
    .description("Show account balances and equity")
    .option("--json", "Output in JSON format")
    .option("--account <alias>", "Use specific account")
    .option("--network <network>", "Network to use (testnet, netna, local)")
    .action(async (options: OutputOptions & { account?: string; network?: string }) => {
      try {
        const subaccountAddr = resolveSubaccountAddress({ network: options.network as NetworkName, accountAlias: options.account });
        const readDex = createReadDex({ network: options.network as NetworkName });

        // Fetch account overview
        const overview = await readDex.accountOverview.getByAddr({
          subAddr: subaccountAddr,
        });

        const data = {
          subaccountAddress: subaccountAddr,
          ...overview,
        };

        formatOutput(
          data,
          (d) => {
            const table = createTable(["Property", "Value"]);
            table.push(["Subaccount Address", formatAddress(d.subaccountAddress)]);
            // perp_equity_balance = account value (collateral + unrealized PnL)
            table.push(["Account Value", `$${Number(d.perp_equity_balance).toFixed(2)}`]);
            table.push(["Unrealized PnL", `$${Number(d.unrealized_pnl).toFixed(2)}`]);
            // cross_account_position is the net position value
            table.push(["Position Value", `$${Number(d.cross_account_position).toFixed(2)}`]);
            table.push(["Withdrawable (Cross)", `$${Number(d.usdc_cross_withdrawable_balance).toFixed(2)}`]);
            console.log(table.toString());
          },
          options
        );
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  return account;
}
