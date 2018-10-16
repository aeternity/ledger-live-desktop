// @flow

import Ae from '@aeternity/ledger-app-api'
import { Crypto } from '@aeternity/aepp-sdk'
import type Transport from '@ledgerhq/hw-transport'
import { BigNumber } from 'bignumber.js'
import Epoch from '../../api/Aeternity'

const bnToNumber = bigNumber => +BigNumber.prototype.valueOf.call(bigNumber)

export default async (
  transport: Transport<*>,
  currencyId: string,
  path: string,
  transaction,
) => {
  const epoch = await Epoch();
  const spendTx = (await epoch.api.postSpend({
    ...transaction,
    amount: bnToNumber(transaction.amount),
    fee: bnToNumber(transaction.fee)
  })).tx
  const binaryTx = Crypto.decodeBase58Check(spendTx.split('_')[1])
  const ae = new Ae(transport)
  const signature = Buffer.from(await ae.signTransaction(+path, binaryTx), 'hex')
  return Crypto.encodeTx(Crypto.prepareTx(signature, binaryTx))
}
