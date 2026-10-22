const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { ethers } = require("ethers");
require("dotenv").config({ quiet: true });

const root = path.resolve(__dirname, "../..");
const artifact = require("../../deployments/fusdt0/artifact.json");
const recordPath = path.join(root, "deployments/fusdt-bnb.json");
const testRecordPath = path.join(
  root,
  "deployments/fusdt-bnb/fork-test-result.json"
);
const params = {
  chainId: 56,
  underlying: "0x55d398326f99059fF775485246999027B3197955",
  aToken: "0xa9251ca9DE909CB71783723713B21E4233fbf1B1",
  pool: "0x6807dc923806fE8Fd134338EABCA509979a7e0cB",
  poolAddressesProvider: "0xff75B6da14FfbbfD355Daf7a2731456b3562Ba6D",
  owner: "0xf57710Ec707CcE333DF85d2C12b42e17B6f8d8Fc",
  referralCode: 0,
  shareName: "FUSDT",
  shareSymbol: "FUSDT",
  performanceFeeWad: "250000000000000000",
  performanceFeePercent: 25,
  aaveLabsFeeSplitPercent: 0,
  initialLockDepositRaw: "1000000000000000000",
  initialLockDeposit: "1 USDT",
};
const args = [
  params.underlying,
  params.referralCode,
  params.poolAddressesProvider,
  params.owner,
  params.performanceFeeWad,
  params.shareName,
  params.shareSymbol,
  params.initialLockDepositRaw,
];
const gasBudget = ethers.utils.parseEther("0.001");
let state;
function save() {
  fs.writeFileSync(recordPath, `${JSON.stringify(state, null, 2)}\n`);
}
function normalizedRuntime(code) {
  let hex = code.replace(/^0x/, "").toLowerCase();
  for (const refs of Object.values(artifact.immutableReferences)) {
    for (const { start, length } of refs) {
      hex =
        hex.slice(0, start * 2) +
        "0".repeat(length * 2) +
        hex.slice((start + length) * 2);
    }
  }
  return hex;
}
async function main() {
  const provider = new ethers.providers.JsonRpcProvider(
    process.env.BNB_RPC_URL || "https://bsc-dataseed.bnbchain.org"
  );
  provider.pollingInterval = 1000;
  assert.equal((await provider.getNetwork()).chainId, params.chainId);
  assert.ok(process.env.PRIVATE_KEY, "Missing PRIVATE_KEY in the ignored .env");
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  assert.equal(wallet.address, "0x119aa0EA38abD1D6299e08c73A08d693395AC0f6");
  const token = new ethers.Contract(
    params.underlying,
    [
      "function balanceOf(address) view returns(uint256)",
      "function allowance(address,address) view returns(uint256)",
      "function approve(address,uint256) returns(bool)",
      "function decimals() view returns(uint8)",
    ],
    wallet
  );
  const pool = new ethers.Contract(
    params.pool,
    ["function getConfiguration(address) view returns(tuple(uint256 data))"],
    provider
  );
  const addressesProvider = new ethers.Contract(
    params.poolAddressesProvider,
    ["function getPool() view returns(address)"],
    provider
  );
  const [
    balance,
    tokenBalance,
    nonce,
    pendingNonce,
    decimals,
    config,
    actualPool,
    price,
  ] = await Promise.all([
    provider.getBalance(wallet.address),
    token.balanceOf(wallet.address),
    wallet.getTransactionCount("latest"),
    wallet.getTransactionCount("pending"),
    token.decimals(),
    pool.getConfiguration(params.underlying),
    addressesProvider.getPool(),
    provider.getGasPrice(),
  ]);
  assert.equal(nonce, pendingNonce, "Signer has pending transactions");
  assert.ok(
    price.lte(ethers.utils.parseUnits("0.1", "gwei")),
    "Gas price exceeds 0.1 gwei"
  );
  assert.equal(decimals, 18);
  assert.equal(actualPool, params.pool);
  const railgun = require("../../deployments/bnb.json");
  const delegator = new ethers.Contract(
    railgun.contracts.delegator,
    ["function owner() view returns(address)"],
    provider
  );
  assert.equal(
    await delegator.owner(),
    params.owner,
    "Railgun owner differs from vault owner"
  );
  const aToken = new ethers.Contract(
    params.aToken,
    [
      "function UNDERLYING_ASSET_ADDRESS() view returns(address)",
      "function POOL() view returns(address)",
    ],
    provider
  );
  assert.equal(await aToken.UNDERLYING_ASSET_ADDRESS(), params.underlying);
  assert.equal(await aToken.POOL(), params.pool);
  const bits = BigInt(config.data.toString());
  assert.ok(bits & (1n << 56n), "Reserve inactive");
  assert.equal(
    bits & ((1n << 57n) | (1n << 60n)),
    0n,
    "Reserve frozen or paused"
  );
  const factory = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode,
    wallet
  );
  state = fs.existsSync(recordPath)
    ? JSON.parse(fs.readFileSync(recordPath, "utf8"))
    : {
        network: "bnb",
        ...params,
        deployer: wallet.address,
        deploymentNonce: nonce + 1,
        vault: ethers.utils.getContractAddress({
          from: wallet.address,
          nonce: nonce + 1,
        }),
        sourceRepository: artifact.sourceRepository,
        sourceCommit: artifact.sourceCommit,
        contractName: artifact.contractName,
        compiler: artifact.compiler,
        rpcUrl: "https://bsc-dataseed.bnbchain.org",
        blockExplorerUrl: "https://bscscan.com",
        transactions: {},
        status: "prepared",
      };
  assert.equal(state.owner, params.owner);
  assert.equal(state.chainId, params.chainId);
  assert.equal(state.underlying, params.underlying);
  assert.equal(state.shareSymbol, params.shareSymbol);
  assert.equal(state.performanceFeeWad, params.performanceFeeWad);
  assert.equal(state.sourceCommit, artifact.sourceCommit);
  console.log(
    JSON.stringify({
      vault: state.vault,
      owner: params.owner,
      performanceFeePercent: 25,
      aaveLabsFeeSplitPercent: 0,
      seedUsdt: ethers.utils.formatUnits(tokenBalance, 18),
      bnbBalance: ethers.utils.formatEther(balance),
      gasBudgetBNB: ethers.utils.formatEther(gasBudget),
      broadcast: process.argv.includes("--broadcast"),
    })
  );
  if (!process.argv.includes("--broadcast")) return;
  const testRecord = JSON.parse(fs.readFileSync(testRecordPath, "utf8"));
  assert.equal(testRecord.chainId, 56);
  assert.equal(testRecord.status, "passed");
  assert.equal(testRecord.testsPassed, 3);
  assert.equal(
    testRecord.creationBytecodeHash,
    ethers.utils.keccak256(artifact.bytecode)
  );

  async function submit(label, request) {
    let saved = state.transactions[label];
    if (!saved) {
      assert.equal(
        await wallet.getTransactionCount("pending"),
        request.nonce,
        "Unexpected signer nonce"
      );
      const gasLimit = (await wallet.estimateGas(request)).mul(130).div(100);
      const gasPrice = price;
      const spent = Object.values(state.transactions).reduce(
        (sum, tx) => sum.add(tx.costWei || 0),
        ethers.constants.Zero
      );
      assert.ok(
        spent.add(gasLimit.mul(gasPrice)).lte(gasBudget),
        "Deployment gas budget exceeded"
      );
      assert.ok(
        (await wallet.getBalance()).gte(gasLimit.mul(gasPrice)),
        "Insufficient BNB"
      );
      const tx = {
        ...request,
        gasLimit: gasLimit.toHexString(),
        gasPrice: gasPrice.toHexString(),
        chainId: 56,
        type: 0,
        value: "0x00",
      };
      const signed = await wallet.signTransaction(tx);
      saved = state.transactions[label] = {
        hash: ethers.utils.keccak256(signed),
        request: tx,
      };
      save();
    }
    let receipt = await provider.getTransactionReceipt(saved.hash);
    if (!receipt) {
      const signed = await wallet.signTransaction(saved.request);
      assert.equal(ethers.utils.keccak256(signed), saved.hash);
      if (!(await provider.getTransaction(saved.hash)))
        await provider.sendTransaction(signed);
      console.log(`${label} transaction: ${saved.hash}`);
      receipt = await provider.waitForTransaction(saved.hash, 1, 60000);
    }
    assert.ok(receipt, `${label} transaction still pending; rerun to resume`);
    assert.equal(receipt.status, 1, `${label} transaction reverted`);
    saved.receipt = receipt;
    saved.costWei = receipt.gasUsed.mul(receipt.effectiveGasPrice).toString();
    save();
    return receipt;
  }

  if ((await provider.getCode(state.vault)) === "0x") {
    assert.ok(
      tokenBalance.gte(params.initialLockDepositRaw),
      "Need 1 USDT for the seed"
    );
    if (!state.transactions.approval || !state.transactions.approval.receipt) {
      if (!state.transactions.approval) {
        assert.ok(
          (await token.allowance(wallet.address, state.vault)).isZero(),
          "Unexpected existing allowance"
        );
      }
      await submit("approval", {
        to: params.underlying,
        data: token.interface.encodeFunctionData("approve", [
          state.vault,
          params.initialLockDepositRaw,
        ]),
        nonce: state.deploymentNonce - 1,
      });
    }
    assert.ok(
      (await token.allowance(wallet.address, state.vault)).eq(
        params.initialLockDepositRaw
      )
    );
    const receipt = await submit("deployment", {
      ...factory.getDeployTransaction(...args),
      nonce: state.deploymentNonce,
    });
    assert.equal(receipt.contractAddress, state.vault);
  }
  const vault = new ethers.Contract(state.vault, artifact.abi, provider);
  const getters = [
    "asset",
    "ATOKEN",
    "AAVE_POOL",
    "POOL_ADDRESSES_PROVIDER",
    "owner",
    "getFee",
    "name",
    "symbol",
    "decimals",
    "REFERRAL_CODE",
  ];
  const values = await Promise.all(getters.map((name) => vault[name]()));
  const expected = [
    params.underlying,
    params.aToken,
    params.pool,
    params.poolAddressesProvider,
    params.owner,
    ethers.BigNumber.from(params.performanceFeeWad),
    params.shareName,
    params.shareSymbol,
    18,
    0,
  ];
  values.forEach((value, index) =>
    assert.equal(value.toString(), expected[index].toString(), getters[index])
  );
  const runtime = await provider.getCode(state.vault);
  assert.equal(
    normalizedRuntime(runtime),
    normalizedRuntime(artifact.deployedBytecode),
    "Runtime mismatch"
  );
  assert.ok(
    (await vault.balanceOf(state.vault)).eq(params.initialLockDepositRaw),
    "Missing seed shares"
  );
  assert.ok(
    (await vault.totalSupply()).gte(params.initialLockDepositRaw),
    "Missing initial supply"
  );
  assert.ok(
    (await token.allowance(wallet.address, state.vault)).isZero(),
    "Seed allowance not consumed"
  );
  await assert.rejects(
    vault.callStatic.setFee(0, { from: wallet.address }),
    /Ownable: caller is not the owner/
  );
  await vault.callStatic.setFee(params.performanceFeeWad, {
    from: params.owner,
  });
  const totalGasCost = Object.values(state.transactions).reduce(
    (sum, tx) => sum.add(tx.costWei || 0),
    ethers.constants.Zero
  );
  state.status = "deployed";
  state.verification = {
    ...state.verification,
    verifiedAtBlock: await provider.getBlockNumber(),
    runtimeBytecodeMatched: true,
    runtimeCodeHash: ethers.utils.keccak256(runtime),
    runtimeBytes: (runtime.length - 2) / 2,
    ownerAndReserveVerified: true,
    seedSharesRaw: (await vault.balanceOf(state.vault)).toString(),
    forkTests: testRecord.testsPassed,
    forkBlock: testRecord.forkBlock,
    forkRpcUrl: testRecord.rpcUrl,
    sourceVerificationPerformed:
      state.verification?.sourceVerificationPerformed || false,
  };
  state.gasCostBNB = ethers.utils.formatEther(totalGasCost);
  state.remainingDeployerBNB = ethers.utils.formatEther(
    await wallet.getBalance()
  );
  state.constructorArguments = factory.interface.encodeDeploy(args);
  state.assetDecimals = 18;
  state.protocolVersion = "Aave V3";
  state.artifactPath = "deployments/fusdt0/artifact.json";
  state.compilerInputPath = "deployments/fusdt0/compiler-input.json";
  save();
  console.log(
    JSON.stringify({
      vault: state.vault,
      verified: true,
      gasCostBNB: state.gasCostBNB,
      remainingDeployerBNB: state.remainingDeployerBNB,
    })
  );
}
main().catch((error) => {
  console.error(error.message.slice(0, 1200));
  process.exitCode = 1;
});
