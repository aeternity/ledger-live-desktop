// @flow

import React, { Component } from 'react'
import type { Account, Currency } from '@ledgerhq/live-common/lib/types'

import Box from 'components/base/Box'
import AccountCard from './AccountCard'
import AccountCardListHeader from './AccountCardListHeader'
import AccountCardPlaceholder from './AccountCardPlaceholder'

type Props = {
  accounts: Account[],
  onAccountClick: Account => void,
  counterValue: Currency,
  daysCount: number,
}

class AccountCardList extends Component<Props> {
  render() {
    const { accounts, counterValue, daysCount, onAccountClick } = this.props

    return (
      <Box flow={4}>
        <AccountCardListHeader accountsLength={accounts.length} />
        <Box
          horizontal
          flexWrap="wrap"
          justifyContent="flex-start"
          alignItems="center"
          style={{ margin: '0 -16px' }}
          data-e2e="dashboard_AccountList"
        >
          {accounts
            .map(account => ({
              key: account.id,
              account,
            }))
            .concat(
              Array(3 - (accounts.length % 3))
                .fill(null)
                .map((_, i) => ({
                  key: `placeholder_${i}`,
                  withPlaceholder: i === 0,
                })),
            )
            .map(item => (
              <Box key={item.key} flex="33%" p={16}>
                {item.account ? (
                  <AccountCard
                    key={item.account.id}
                    counterValue={counterValue}
                    account={item.account}
                    daysCount={daysCount}
                    onClick={onAccountClick}
                  />
                ) : item.withPlaceholder ? (
                  <AccountCardPlaceholder />
                ) : null}
              </Box>
            ))}
        </Box>
      </Box>
    )
  }
}

export default AccountCardList
