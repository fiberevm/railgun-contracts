# FUSDT0 on Arbitrum One

FUSDT0 uses Aave's unmodified `ImmutableATokenVault`, an ERC-4626 vault supplying
USDT0 into Aave V3. The deployed address is
[`0x5a847BE0F397a57C8f7E4193AF093F4f0A422571`](https://arbiscan.io/address/0x5a847BE0F397a57C8f7E4193AF093F4f0A422571).
Its name and symbol are both `FUSDT0`, with six decimals.

The owner is `0xf57710Ec707CcE333DF85d2C12b42e17B6f8d8Fc`, matching Railgun's
controlling owner on Base and Arbitrum. The vault charges 25% of yield, expressed
as `250000000000000000` in wad. Only the owner can change this fee or call
`withdrawFees(to, amount)`. Fees are withdrawn as Aave aUSDT0 tokens; the owner
can redeem these through Aave. There is no Aave Labs fee recipient or revenue
splitter. Aave's underlying market economics still apply to the supply yield.

This vault was deployed directly, bypassing Aave Labs' API and its automatic
50% allocation of vault performance fees to Aave Labs. Direct deployments are
not listed through Aave Labs' API/SDK, according to the
[Aave deployment guide](https://www.aave.com/docs/vaults/simple-earn/deploy).
The vault code is immutable; owner operations remain available.

The initializer supplied 1 USDT0 to Aave and minted 1,000,000 seed shares to the
vault itself. No user deposit beyond this deployment seed was made.

## Records

- [`../fusdt0-arbitrum.json`](../fusdt0-arbitrum.json): configuration, constructor
  arguments, transaction requests and receipts, gas cost, and live verification.
- [`artifact.json`](artifact.json): ABI, creation and runtime bytecode, immutable
  locations, source commit, and compiler settings.
- [`compiler-input.json`](compiler-input.json): complete Solidity standard JSON
  input for the vault and its dependencies, retaining the original source license
  notices. It contains no signer secrets.
- [`../../scripts/aave/test/FUSDT0Arbitrum.t.sol`](../../scripts/aave/test/FUSDT0Arbitrum.t.sol):
  three passing tests against an Arbitrum fork at block `513310208`, covering owner
  permissions, deposit/redemption, and withdrawing the full 25% yield fee to the owner.

Source: [aave/aave-vault at `5ab52d20b07f35a8f34e6702f2fea6797a5787eb`](https://github.com/aave/aave-vault/tree/5ab52d20b07f35a8f34e6702f2fea6797a5787eb).
Sourcify verified the deployed source with status `match`:
[verification result](https://sourcify.dev/server/v2/verify/44b621e6-203b-43ae-8317-8a9308a55871).
Arbiscan source verification was not submitted because no Etherscan API key was configured.
Compilation used Solidity `0.8.22+commit.4fc1097e`, 30,000 optimizer runs, no IR,
Shanghai bytecode, and metadata bytecode hash `none`. Tests execute using Cancun,
which is required by the current Aave pool implementation. Foundry 1.7.1 targets
Shanghai during Solidity 0.8.22 compilation when configured to execute Cancun.

## Reproduce the fork checks

From the repository root, restore the pinned source in the ignored directory:

```bash
rtk git clone https://github.com/aave/aave-vault.git scripts/ephemeral/aave-vault
rtk git -C scripts/ephemeral/aave-vault checkout 5ab52d20b07f35a8f34e6702f2fea6797a5787eb
rtk git -C scripts/ephemeral/aave-vault submodule update --init --recursive
rtk forge test --root scripts/aave -vv
```

The deployment helper reads the generated signer from the ignored `.env`. Running
`rtk node scripts/aave/deploy-fusdt0.cjs` performs a read-only preflight. Its
`--broadcast` mode resumes the saved deployment and verifies the existing vault;
it does not create another vault after this record has been deployed. Keep the
signer secret local. Future vault administration requires the owner's signer.
