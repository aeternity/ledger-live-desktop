// @flow

import { Observable } from 'rxjs'
import { BigNumber } from 'bignumber.js'
import logger from 'logger'
import flatMap from 'lodash/flatMap'
import type { Account, Operation } from '@ledgerhq/live-common/lib/types'
import { Crypto } from '@aeternity/aepp-sdk'
import Aeternity from 'api/Aeternity'
import type { Tx, SpendTx } from 'api/Aeternity'
import { getDerivations } from 'helpers/derivations'
import getAddressCommand from 'commands/getAddress'
import signTransactionCommand from 'commands/signTransaction'
import { getAccountPlaceholderName, getNewAccountPlaceholderName } from 'helpers/accountName'
import { NotEnoughBalance } from 'config/errors'
import type { WalletBridge } from './types'

// in case of a SELF send, 2 ops are returned.
const txToOps = (account: Account) => (tx: Tx): Operation[] => {
  const { freshAddress } = account
  const { senderId, recipientId, blockHeight, blockHash, hash, time } = tx
  const value = BigNumber(tx.amount)
  const fee = BigNumber(tx.fee)
  const ops = []
  const op = {
    hash,
    accountId: account.id,
    fee,
    blockHeight,
    blockHash,
    senders: [senderId],
    recipients: [recipientId],
  }
  if (freshAddress === senderId) {
    ops.push({
      ...op,
      id: `${account.id}-${hash}-OUT`,
      type: 'OUT',
      value: value.plus(fee),
      date: new Date(time),
    })
  }
  if (freshAddress === recipientId) {
    ops.push({
      ...op,
      id: `${account.id}-${hash}-IN`,
      type: 'IN',
      value,
      date: new Date(time + 1), // hack: make the IN appear after the OUT in history.
    })
  }
  return ops
}

const SAFE_REORG_THRESHOLD = 80

const AeternityBridge: WalletBridge<SpendTx> = {
  scanAccountsOnDevice: (currency, deviceId) =>
    Observable.create(o => {
      let finished = false
      let newAccountCount = 0

      async function stepAddress(
        index,
        { address, path: freshAddressPath },
      ): { account?: Account, complete?: boolean } {
        const epoch = await Aeternity()
        if (finished) return { complete: true }
        const balance = BigNumber(await epoch.getBalance(address))
        if (finished) return { complete: true }
        const currentBlock = await epoch.api.getTopBlock()
        if (finished) return { complete: true }
        const txs = await epoch.getTransactions(address)
        if (finished) return { complete: true }

        const freshAddress = address
        const accountId = `${currency.id}:${address}`
        const isNewAccount = txs.length === 0 && balance.isZero()

        const account: $Exact<Account> = {
          id: accountId,
          xpub: '',
          freshAddress,
          freshAddressPath,
          name: isNewAccount
            ? getNewAccountPlaceholderName(currency, index)
            : getAccountPlaceholderName(currency, index),
          balance,
          blockHeight: currentBlock.height,
          index,
          currency,
          operations: [],
          pendingOperations: [],
          unit: currency.units[0],
          lastSyncDate: new Date(),
        }

        if (isNewAccount) {
          if (newAccountCount === 0) {
            return { account, complete: true }
          }
          newAccountCount++
          return { complete: true }
        }

        account.operations = flatMap(txs.reverse(), txToOps(account))
        return { account }
      }

      ;(async () => {
        const derivation = getDerivations(currency)[0]
        for (let index = 0; index < 255; index++) {
          const freshAddressPath = derivation({ currency, x: index, segwit: false })
          const res = await getAddressCommand
            .send({ currencyId: currency.id, devicePath: deviceId, path: freshAddressPath })
            .toPromise()
          const r = await stepAddress(index, res)
          logger.log(
            `scanning ${currency.id} at ${freshAddressPath}: ${res.address} resulted of ${
              r.account ? `Account with ${r.account.operations.length} txs` : 'no account'
            }. ${r.complete ? 'ALL SCANNED' : ''}`,
          )
          if (r.account) {
            o.next(r.account)
          }
          if (r.complete) {
            break
          }
        }
      })().then(() => o.complete(), e => o.error(e))

      return () => {
        finished = true
      }
    }),

  synchronize: ({ freshAddress, blockHeight, operations }) =>
    Observable.create(o => {
      let unsubscribed = false
      ;(async () => {
        const epoch = await Aeternity()
        if (unsubscribed) return
        const currentHeight = (await epoch.api.getCurrentKeyBlockHeight()).height
        if (unsubscribed) return

        const filterConfirmedOperations = o =>
          o.blockHeight && blockHeight - o.blockHeight > SAFE_REORG_THRESHOLD
        if (currentHeight !== blockHeight) {
          operations = operations.filter(filterConfirmedOperations)
        }

        const txs = await epoch.getTransactions(freshAddress)
        if (unsubscribed) return
        const balance = BigNumber(await epoch.getBalance(freshAddress))
        if (unsubscribed) return
        o.next(account => {
          const operations = flatMap(txs.reverse(), txToOps(account))
          return {
            ...account,
            pendingOperations: account.pendingOperations.filter(
              ({ id }) => !operations.some(op => op.id === id),
            ),
            operations,
            balance,
            blockHeight: currentHeight,
            lastSyncDate: new Date(),
          }
        })
      })().then(() => o.complete(), e => o.error(e))

      return () => {
        unsubscribed = true
      }
    }),

  pullMoreOperations: () => Promise.reject(new Error('AeternityJSBridge: not implemented')),

  isRecipientValid: (currency, recipient) => {
    let isValid
    try {
      isValid =
        recipient.slice(0, 3) === 'ak_' &&
        Crypto.decodeBase58Check(recipient.slice(3)).length === 32
    } catch (e) {
      isValid = false
    }
    return Promise.resolve(isValid)
  },

  getRecipientWarning: () => Promise.resolve(null),

  createTransaction: account => ({
    fee: 1,
    amount: 0,
    senderId: account.freshAddress,
    recipientId: '',
    payload: '',
    ttl: Number.MAX_SAFE_INTEGER,
  }),

  editTransactionAmount: (account, t, amount) => ({
    ...t,
    amount: +amount,
  }),

  getTransactionAmount: (account, transaction) => BigNumber(transaction.amount),

  editTransactionRecipient: (account, transaction, recipientId) => ({
    ...transaction,
    recipientId,
  }),

  getTransactionRecipient: (account, transaction) => transaction.recipientId,

  checkValidTransaction: (account, transaction) =>
    account.balance.isGreaterThanOrEqualTo(transaction.amount)
      ? Promise.resolve(true)
      : Promise.reject(new NotEnoughBalance()),

  getTotalSpent: (account, transaction) =>
    Promise.resolve(BigNumber(transaction.amount + transaction.fee)),

  getMaxAmount: (account, transaction) => Promise.resolve(account.balance.minus(transaction.fee)),

  signAndBroadcast: (account, transaction, deviceId) =>
    Observable.create(o => {
      let cancelled = false
      ;(async () => {
        const epoch = await Aeternity()
        if (cancelled) return
        const signedTx = await signTransactionCommand
          .send({
            currencyId: account.currency.id,
            devicePath: deviceId,
            path: account.freshAddressPath,
            transaction,
          })
          .toPromise()
        if (cancelled) return

        o.next({ type: 'signed' })
        const { txHash: hash } = await epoch.api.postTransaction({ tx: signedTx })
        o.next({
          type: 'broadcasted',
          operation: {
            id: `${account.id}-${hash}-OUT`,
            hash,
            type: 'OUT',
            value: BigNumber(transaction.amount),
            fee: BigNumber(transaction.fee),
            blockHeight: null,
            blockHash: null,
            accountId: account.id,
            senders: [account.freshAddress],
            recipients: [transaction.recipientId],
            transactionSequenceNumber: 0,
            date: new Date(),
          },
        })
      })().then(() => o.complete(), e => o.error(e))

      return () => {
        cancelled = true
      }
    }),

  addPendingOperation: (account, operation) => ({
    ...account,
    pendingOperations: [operation].concat(
      account.pendingOperations.filter(
        o => o.transactionSequenceNumber === operation.transactionSequenceNumber,
      ),
    ),
  }),
}

export default AeternityBridge
