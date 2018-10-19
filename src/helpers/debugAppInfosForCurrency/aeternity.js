// @flow

import Ae from '@aeternity/ledger-app-api'
import type Transport from '@ledgerhq/hw-transport'

export default async (transport: Transport<*>) => {
  const ae = new Ae(transport)
  const { version } = await ae.getAppConfiguration()
  return { version }
}
