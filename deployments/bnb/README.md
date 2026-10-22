# Railgun on BNB Smart Chain

Use chain ID **56** and the Railgun proxy
[`0x7233d17ec3Ce855Acb8F7A9412Bf90757117A092`](https://bscscan.com/address/0x7233d17ec3Ce855Acb8F7A9412Bf90757117A092)
as the application entry point. Attach [`RailgunSmartWallet.abi.json`](RailgunSmartWallet.abi.json)
to the proxy address. The implementation address is recorded separately for upgrades.

The controlling owner is `0xf57710Ec707CcE333DF85d2C12b42e17B6f8d8Fc`, matching
the Base and Arbitrum deployments. On-chain, the Railgun proxy and ProxyAdmin are
owned by the Delegator; this controlling address owns the Delegator. The generated
deployment signer has no upgrade permission after the final ownership transfer.
Future administration requires the controlling owner's signer.

The bundler is `0x3674DCF19Df34505E091Df4882318A1e99eD3e29`. Only this address can
call `shield`. The `transact` entry point is public and validates transaction proofs.
Shield, unshield and NFT fees are all zero. The deployment has no governance token,
staking contracts or RelayAdapt contract.

The same deployment signer and contract-creation nonce sequence were used on
Arbitrum, so the contract addresses match that network. Always select chain ID 56
when using this deployment.

## Records and integration

- [`../bnb.json`](../bnb.json): confirmed deployment addresses, controlling owner,
  ownership transfer, zero fees, gas cost, and verification results.
- [`handoff.json`](handoff.json): compact configuration and transaction references
  for another developer or AI.
- [`../bnb-transactions.json`](../bnb-transactions.json): all 109 transaction
  requests, hashes and receipts, including the eight contract creations, 91
  verification-key writes, configuration and ownership transfers.
- [`../bnb-preflight.json`](../bnb-preflight.json): funding and simulation record.
- [`RailgunSmartWallet.abi.json`](RailgunSmartWallet.abi.json): ABI for the Railgun proxy.
- [`Delegator.abi.json`](Delegator.abi.json), [`ProxyAdmin.abi.json`](ProxyAdmin.abi.json),
  [`Treasury.abi.json`](Treasury.abi.json), and
  [`PausableUpgradableProxy.abi.json`](PausableUpgradableProxy.abi.json): administration ABIs.

BNB is the native gas token, with 18 decimals. The public RPC is
`https://bsc-dataseed.bnbchain.org`, and the explorer is `https://bscscan.com`.
The official public RPC disables `eth_getLogs`; applications that sync wallet
events need a BNB RPC supporting log queries, as described in the
[BNB Chain RPC documentation](https://docs.bnbchain.org/bnb-smart-chain/developers/json_rpc/json-rpc-endpoint/).

The final live checks compare all eight runtime bytecode hashes with the local
simulation, check all 91 circuit keys, both proxies' implementations, admin and
paused slots, zero fees, bundler, treasury admin role, and owner/deployer upgrade
permissions. The simulation ran locally with chain ID 56; public RPC historical
state errors prevented completion of a mainnet-fork simulation. Each live
transaction was estimated against BNB mainnet before submission.

Explorer source verification was not submitted. Runtime verification is recorded
separately from explorer source verification in the deployment JSON.

No private keys or API keys are included in these records. The generated deployment
signer remains in the ignored local `.env`.
