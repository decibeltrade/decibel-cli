import { createReadDex, DexOptions, resolveSubaccountAddress } from "../services/dex-factory.js";
import { fetchSpotOpenOrders } from "./spot-utils.js";

/**
 * Every open spot order the API's offset pagination can reach.
 *
 * `truncated` is true when the subaccount has more than one sweep can page to
 * (10_500 orders); the returned list is then a prefix, not the whole set.
 */
export async function getSpotOrders(dexOptions: DexOptions = {}) {
  const subaccountAddr = resolveSubaccountAddress(dexOptions);
  const readDex = createReadDex(dexOptions);

  const { orders, truncated } = await fetchSpotOpenOrders(readDex, subaccountAddr);

  return { orders, truncated };
}
