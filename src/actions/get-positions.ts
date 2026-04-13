import { createReadDex, DexOptions, resolveSubaccountAddress } from "../services/dex-factory.js";

export async function getPositions(dexOptions: DexOptions = {}) {
  const subaccountAddr = resolveSubaccountAddress(dexOptions);
  const readDex = createReadDex(dexOptions);

  const positions = await readDex.userPositions.getByAddr({
    subAddr: subaccountAddr,
    limit: 100,
  });

  return { positions };
}
