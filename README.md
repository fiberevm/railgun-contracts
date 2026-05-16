# RAILGUN Contracts

## Getting started

- Install Node.js - using [nvm](https://github.com/nvm-sh/nvm) is recommended
- Run `npm i` to install dependencies
- (Optional) Setup hardhat local network config in `~/.hardhat/networks.{js|ts|json}` following the [hardhat-local-networks-config-plugin](https://github.com/facuspagnuolo/hardhat-local-networks-config-plugin) format.
- (Optional) Install `hardhat-shorthand` to use `hh` commands.
- Run `hh help` or `npx hardhat help` for list of commands

## Railgun upgrade runbook

`upgrade:railgun` upgrades the Railgun proxy in `deployments/<network>.json`.

### Environment

- `PRIVATE_KEY`, `OWNER_PRIVATE_KEY`, or `owner_private_key`: upgrade signer.
- `ETH_RPC_URL`: Ethereum mainnet RPC URL.
- `BASE_RPC_URL`: Base mainnet RPC URL.
- `ETHERSCAN_API_KEY` or `BASESCAN_API_KEY`: source verification only.

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
