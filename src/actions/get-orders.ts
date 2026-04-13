import { createReadDex, DexOptions, resolveSubaccountAddress } from "../services/dex-factory.js";

export async function getOrders(dexOptions: DexOptions = {}) {
  const subaccountAddr = resolveSubaccountAddress(dexOptions);
  const readDex = createReadDex(dexOptions);

  const orders = await readDex.userOpenOrders.getByAddr({ subAddr: subaccountAddr });

  return { orders };
}
