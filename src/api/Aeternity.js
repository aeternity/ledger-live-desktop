// @flow

import { EpochChain } from '@aeternity/aepp-sdk'
import times from 'lodash/times'

const RPC_URL = 'https://sdk-testnet.aepps.com'
const blocks = []
let epoch

export type Block = {
  height: number,
}

export type Tx = {
  hash: string,
  nonce: string,
  amount: number,
  fee: number,
  time: number,
  senderId: string,
  recipientId: string,
  blockHeight: number,
  blockHash: string,
}

export type SpendTx = {
  fee: number,
  amount: number,
  senderId: string,
  recipientId: string,
  payload: string,
  ttl: number,
}

export type API = {
  getAllTransactions: () => Promise<Tx[]>,
  getBlockTransactions: (height: number, dontUseCache: boolean) => Promise<Tx[]>,
  getTransactions: (address: string) => Promise<Tx[]>,
  getBalance: (address: string) => Promise<number>,
  api: {
    getTopBlock: () => Promise<Block>,
    getCurrentKeyBlockHeight: () => Promise<{ height: number }>,
    postTransaction: ({ tx: String }) => Promise<{ txHash: string }>,
    postSpend: SpendTx => Promise<{ tx: String }>,
  },
}

export default async (): Promise<API> =>
  epoch ||
  (epoch = Object.assign(await EpochChain({ url: RPC_URL, internalUrl: RPC_URL }), {
    async getBlockTransactions(height, dontUseCache) {
      if (!blocks[height] || dontUseCache) {
        const generation = await this.api.getGenerationByHeight(height)
        blocks[height] = (await Promise.all(
          generation.microBlocks.map(async h => {
            const [{ transactions }, { time }] = await Promise.all([
              this.api.getMicroBlockTransactionsByHash(h),
              this.api.getMicroBlockHeaderByHash(h),
            ])
            return transactions
              .map(({ tx, ...other }) => ({ ...tx, ...other, time }))
              .filter(({ type }) => type === 'SpendTx')
          }),
        )).reduce((p, n) => [...p, ...n], [])
      }
      return blocks[height]
    },

    async getAllTransactions() {
      const requestWrapper = async (promiseGenerators, amount) => {
        const res = []
        while (promiseGenerators.length) {
          res.push(...(await Promise.all(promiseGenerators.splice(0, amount).map(f => f()))))
        }
        return res
      }

      const { height } = await this.api.getCurrentKeyBlockHeight()
      return (await requestWrapper(
        times(height + 1, idx => () => this.getBlockTransactions(idx, idx === height)),
        10,
      )).reduce((p, n) => [...p, ...n], [])
    },

    async getTransactions(address) {
      return (await this.getAllTransactions()).filter(({ recipientId, senderId }) =>
        [recipientId, senderId].includes(address),
      )
    },

    async getBalance(address) {
      try {
        return await this.balance(address)
      } catch (e) {
        return 0
      }
    },
  }))
