# RAILGUN Contracts

## Getting started

- Install Node.js - using [nvm](https://github.com/nvm-sh/nvm) is recommended
- Run `npm i` to install dependencies
- (Optional) Setup hardhat local network config in `~/.hardhat/networks.{js|ts|json}` following the [hardhat-local-networks-config-plugin](https://github.com/facuspagnuolo/hardhat-local-networks-config-plugin) format.
- (Optional) Install `hardhat-shorthand` to use `hh` commands.
- Run `hh help` or `npx hardhat help` for list of commands

## Arbitrum One deployment

Arbitrum One mainnet is configured as the `arbitrum` Hardhat network (chain ID `42161`).
Deploy the zero-fee, no-governance setup with the same bundler used by the Ethereum and
Base deployments:

```bash
ARBITRUM_RPC_URL=<RPC_URL> PRIVATE_KEY=<DEPLOYER_PRIVATE_KEY> \
  yarn hardhat deploy:no_governance --network arbitrum \
  --bundler 0x3674DCF19Df34505E091Df4882318A1e99eD3e29
```

The deployer must hold enough ETH on Arbitrum One for gas. A successful deployment writes
`deployments/arbitrum.json`. Run `yarn hardhat verify:runtime --network arbitrum` afterward.
Set `ETHERSCAN_API_KEY` before running `yarn hardhat verify:source --network arbitrum`.
The default public RPC is `https://arb1.arbitrum.io/rpc`, as listed in the
[Arbitrum chain information](https://docs.arbitrum.io/chain-info).

The deployed Railgun proxy is
[0x7233d17ec3Ce855Acb8F7A9412Bf90757117A092](https://arbiscan.io/address/0x7233d17ec3Ce855Acb8F7A9412Bf90757117A092).
Contract addresses are recorded in [`deployments/arbitrum.json`](deployments/arbitrum.json),
with transaction receipts and runtime verification results in
[`deployments/arbitrum-transactions.json`](deployments/arbitrum-transactions.json).

The Arbitrum Delegator is owned by
[0xf57710Ec707CcE333DF85d2C12b42e17B6f8d8Fc](https://arbiscan.io/address/0xf57710Ec707CcE333DF85d2C12b42e17B6f8d8Fc),
matching the controlling owner of the Base deployment. Use this owner's signing key for
future administration. The ownership transfer is recorded in
[`deployments/arbitrum-owner-transfer.json`](deployments/arbitrum-owner-transfer.json).

The deployment and ownership transfer confirmed 109 transactions, costing
`0.002210991012271547 ETH` in total. Runtime verification matched all eight deployed
contracts against the simulation and checked all 91 circuit keys. Shield, unshield, and
NFT fees are zero. Explorer source verification was not performed during deployment.

## FUSDT0 Aave V3 vault

The Arbitrum USDT0 earn vault is
[FUSDT0 (`0x5a847BE0F397a57C8f7E4193AF093F4f0A422571`)](https://arbiscan.io/address/0x5a847BE0F397a57C8f7E4193AF093F4f0A422571),
using Aave's unmodified immutable ERC-4626 vault. It has a 25% performance fee,
with all fee withdrawals controlled by the same owner as Railgun and no Aave Labs
fee split. Its initial seed is 1 USDT0.

See [`deployments/fusdt0/README.md`](deployments/fusdt0/README.md) for the ABI,
pinned source, fork tests, and operating details, and
[`deployments/fusdt0-arbitrum.json`](deployments/fusdt0-arbitrum.json) for configuration
and transaction receipts.

## Polygon PoS deployment

Polygon PoS mainnet is configured as the `polygon` Hardhat network (chain ID `137`). Deploy
the no-governance setup with the same bundler used by the Ethereum and Base deployments:

```bash
POLYGON_RPC_URL=<RPC_URL> PRIVATE_KEY=<DEPLOYER_PRIVATE_KEY> \
  yarn hardhat deploy:no_governance --network polygon \
  --bundler 0x3674DCF19Df34505E091Df4882318A1e99eD3e29
```

The deployer must hold enough native POL for gas. A successful deployment writes
`deployments/polygon.json`. Set `ETHERSCAN_API_KEY` before running `verify:source`.

## Railgun upgrade runbook

`upgrade:railgun` upgrades the Railgun proxy in `deployments/<network>.json`.

### Environment

- `PRIVATE_KEY`, `OWNER_PRIVATE_KEY`, or `owner_private_key`: upgrade signer.
- `ETH_RPC_URL`: Ethereum mainnet RPC URL.
- `BASE_RPC_URL`: Base mainnet RPC URL.
- `ARBITRUM_RPC_URL`: Arbitrum One mainnet RPC URL.
- `ETHERSCAN_API_KEY`: multichain source verification only.

### Preflight

```bash
yarn hardhat verify:runtime --network base
yarn hardhat verify:runtime --network mainnet
```

Base public RPC fallback:

```bash
BASE_RPC_URL=https://mainnet.base.org yarn hardhat verify:runtime --network base
```

### Upgrade

```bash
yarn hardhat upgrade:railgun --network base
yarn hardhat upgrade:railgun --network mainnet
```

Use a predeployed implementation:

```bash
yarn hardhat upgrade:railgun --network base --implementation <IMPLEMENTATION_ADDRESS>
yarn hardhat upgrade:railgun --network mainnet --implementation <IMPLEMENTATION_ADDRESS>
```

### Post-upgrade

```bash
yarn hardhat verify:runtime --network <network>
yarn hardhat verify:source --network <network>
```

Confirm current implementation without deploying another one:

```bash
yarn hardhat upgrade:railgun --network <network> --implementation <CURRENT_ARTIFACT_IMPLEMENTATION>
```

Commit the updated `deployments/<network>.json`.

Do not rerun `upgrade:railgun` without `--implementation` unless you want to
deploy and upgrade to another fresh implementation.
