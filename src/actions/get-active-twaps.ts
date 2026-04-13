import { createReadDex, DexOptions, resolveSubaccountAddress } from "../services/dex-factory.js";

export async function getActiveTwaps(dexOptions: DexOptions = {}) {
  const subaccountAddr = resolveSubaccountAddress(dexOptions);
  const readDex = createReadDex(dexOptions);

  const twaps = await readDex.userActiveTwaps.getByAddr({ subAddr: subaccountAddr });

  return { twaps };
}
