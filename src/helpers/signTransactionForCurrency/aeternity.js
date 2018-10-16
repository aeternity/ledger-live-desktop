// @flow

import Ae from '@aeternity/ledger-app-api'
import { Crypto } from '@aeternity/aepp-sdk'
import type Transport from '@ledgerhq/hw-transport'
import Epoch from 'api/Aeternity'
import type { SpendTx } from 'api/Aeternity'

export default async (
  transport: Transport<*>,
  currencyId: string,
  path: string,
  transaction: SpendTx,
) => {
  const epoch = await Epoch()
  const spendTx = (await epoch.api.postSpend(transaction)).tx
  const binaryTx = Crypto.decodeBase58Check(spendTx.split('_')[1])
  const ae = new Ae(transport)
  const signature = Buffer.from(await ae.signTransaction(+path, binaryTx), 'hex')
  return Crypto.encodeTx(Crypto.prepareTx(signature, binaryTx))
}
