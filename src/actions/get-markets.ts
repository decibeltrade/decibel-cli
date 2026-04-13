import { createReadDex, DexOptions } from "../services/dex-factory.js";

export async function getMarkets(dexOptions: DexOptions = {}) {
  const readDex = createReadDex(dexOptions);
  const markets = await readDex.markets.getAll();

  return {
    markets: markets.map((m) => ({
      name: m.market_name,
      address: m.market_addr,
      maxLeverage: m.max_leverage,
      tickSize: m.tick_size,
      minSize: m.min_size,
      lotSize: m.lot_size,
      mode: m.mode,
      sizeDecimals: m.sz_decimals,
      priceDecimals: m.px_decimals,
    })),
  };
}
