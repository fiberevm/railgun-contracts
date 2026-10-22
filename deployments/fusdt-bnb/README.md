# FUSDT on BNB Smart Chain

FUSDT is an immutable ERC-4626 vault supplying USDT to Aave V3 on BNB Smart Chain
(chain ID **56**). The vault and share-token address is
[`0x5a847BE0F397a57C8f7E4193AF093F4f0A422571`](https://bscscan.com/address/0x5a847BE0F397a57C8f7E4193AF093F4f0A422571).
Both its name and symbol are `FUSDT`, and its shares have **18 decimals**.

The underlying USDT is
[`0x55d398326f99059fF775485246999027B3197955`](https://bscscan.com/address/0x55d398326f99059fF775485246999027B3197955),
also with 18 decimals. This is a separate deployment from the Arbitrum FUSDT0 vault,
which happens to have the same address because the same deployment signer and
creation nonce were used. Always select chain ID 56 for this vault.

The vault owner is `0xf57710Ec707CcE333DF85d2C12b42e17B6f8d8Fc`, matching the
controlling owner of Railgun. The vault's performance fee is 25% of yield,
encoded as `250000000000000000` in wad. The owner can change this fee and call
`withdrawFees(to, amount)` to withdraw fees as Aave aUSDT tokens to a chosen
recipient. There is no Aave Labs fee recipient or revenue splitter. Normal Aave
underlying market economics apply before the vault's fee.

The contract was deployed directly using Aave's unmodified `ImmutableATokenVault`,
from [Aave source commit `5ab52d20b07f35a8f34e6702f2fea6797a5787eb`](https://github.com/aave/aave-vault/tree/5ab52d20b07f35a8f34e6702f2fea6797a5787eb).
This bypasses the API/SDK deployment path, whose performance-fee configuration
allocates 50% of fee revenue to Aave Labs. Direct deployments are not surfaced
through Aave Labs' API/SDK, according to the
[Aave deployment documentation](https://www.aave.com/docs/vaults/simple-earn/deploy).

The constructor supplied **1 USDT** to Aave and permanently locked
`1000000000000000000` seed shares in the vault itself. No other live deposit was
made by the deployment process. Approval and deployment cost
`0.00026918075 BNB`, leaving `0.0052475891 BNB` in the deployment wallet.

## Records and integration

- [`../fusdt-bnb.json`](../fusdt-bnb.json): complete configuration, constructor
  arguments, transaction requests/receipts, gas costs, and verification results.
- [`handoff.json`](handoff.json): concise configuration for another developer or AI.
- [`abi.json`](abi.json): vault/share-token ABI.
- [`fork-test-result.json`](fork-test-result.json): three passing BNB mainnet-fork
  tests at block `129142000`, plus the matched creation bytecode hash.
- [`../fusdt0/artifact.json`](../fusdt0/artifact.json) and
  [`../fusdt0/compiler-input.json`](../fusdt0/compiler-input.json): shared,
  chain-independent compiled artifact and all 43 canonical source files. Chain
  addresses, owner, fee, token name and seed are constructor arguments.
- [`../../scripts/aave/deploy-fusdt-bnb.cjs`](../../scripts/aave/deploy-fusdt-bnb.cjs):
  guarded, resumable deployment helper. Its default mode is read-only; `--broadcast`
  deploys or resumes the saved deployment with a `0.001 BNB` gas budget and a
  `0.1 gwei` gas-price cap. It does not create another vault after deployment.

Supply USDT by approving the vault and calling `deposit(assets, receiver)`.
Use ERC-4626 preview/conversion methods to display the value of FUSDT shares;
their exchange rate changes as yield accrues. Withdraw using `withdraw` or `redeem`,
subject to the underlying Aave market's available liquidity.

Live verification checked the owner, all immutable reserve addresses, 18 decimals,
name/symbol, fee, referral code zero, seed shares, consumed seed allowance, and
owner/deployer permissions. Runtime bytecode matches the saved artifact after
accounting for the constructor's immutable addresses.

Sourcify verified the source with status **`match`**:
[verification result](https://sourcify.dev/server/v2/verify/7828df5c-ab55-4ebd-984d-5b2a569622c1).
BscScan source verification was not submitted.

## Reproduce the fork tests

Compilation uses Solidity `0.8.22+commit.4fc1097e`, 30,000 optimizer runs, no IR,
Shanghai bytecode, and metadata bytecode hash `none`. Test execution uses Cancun.

Restore the pinned source in an ignored directory and populate missing dependency
files from the saved canonical compiler input:

```bash
rtk git clone https://github.com/aave/aave-vault.git scripts/ephemeral/aave-vault
rtk git -C scripts/ephemeral/aave-vault checkout 5ab52d20b07f35a8f34e6702f2fea6797a5787eb
rtk git -C scripts/ephemeral/aave-vault submodule update --init --recursive
rtk node scripts/aave/restore-vault-sources.cjs
rtk env BNB_FORK_RPC_URL=<BNB_ARCHIVE_RPC> BNB_FORK_BLOCK=129142000 \
  forge test --root scripts/aave --match-contract FUSDTBNBTest -vv
```

The tests cover configuration and permissions, deposit/redemption, and withdrawing
the full 25% yield fee to the owner. The compiler output was also checked byte for
byte against the artifact used for deployment. The deployment signer stays in
the ignored local `.env`; future administration requires the owner's signer.
