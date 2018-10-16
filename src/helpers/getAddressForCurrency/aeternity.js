// @flow

import type { CryptoCurrency } from '@ledgerhq/live-common/lib/types'
import Ae from '@aeternity/ledger-app-api'
import type Transport from '@ledgerhq/hw-transport'

export default async (
  transport: Transport<*>,
  currency: CryptoCurrency,
  accountIndex: string,
  { verify = false }: *,
) => {
  const ae = new Ae(transport)
  const address = await ae.getAddress(+accountIndex, verify)
  return { address, path: accountIndex, publicKey: '' }
}
