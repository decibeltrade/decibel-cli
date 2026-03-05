import { type ClickHouseClient, createClient } from "@clickhouse/client";

/**
 * Resolve the ClickHouse URL from a CLI option or environment variable.
 */
export function getClickHouseUrl(optionUrl?: string): string | undefined {
  return optionUrl || process.env.DECIBEL_CLICKHOUSE_URL;
}

/**
 * Create a ClickHouse client from a connection URL.
 * The URL should include credentials, e.g. https://user:pass@host:8443
 */
export function createClickHouseClient(url: string): ClickHouseClient {
  return createClient({ url, request_timeout: 30000 });
}
