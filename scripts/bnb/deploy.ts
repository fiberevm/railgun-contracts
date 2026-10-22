import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import hre from 'hardhat';
import { BigNumber, providers, Wallet } from 'ethers';
import { getKeys, listArtifacts } from '../../helpers/logic/artifacts';
import { patchProviderForContractCreation } from '../../tasks/deploy/shared';

const DEPLOYER = '0x119aa0EA38abD1D6299e08c73A08d693395AC0f6';
const OWNER = '0xf57710Ec707CcE333DF85d2C12b42e17B6f8d8Fc';
const BUNDLER = '0x3674DCF19Df34505E091Df4882318A1e99eD3e29';
const ROOT = path.resolve(__dirname, '../..');
const PLAN_PATH = path.join(ROOT, 'scripts/ephemeral/bnb-plan.json');
const JOURNAL_PATH = path.join(ROOT, 'deployments/bnb-transactions.json');
const ARTIFACT_PATH = path.join(ROOT, 'deployments/bnb.json');
const BUDGET = hre.ethers.utils.parseEther('0.011');
const MAX_GAS_PRICE = hre.ethers.utils.parseUnits('0.1', 'gwei');

type Contracts = Record<string, string>;
interface PlannedTransaction {
  nonce: number;
  to: string | null;
  data: string;
  value: string;
  gasUsed: string;
}
interface Plan {
  chainId: number;
  simulationMode: 'local' | 'fork';
  forkBlockNumber?: number;
  forkBlockHash?: string;
  deployer: string;
  owner: string;
  bundler: string;
  contracts: Contracts;
  runtimeHashes: Record<string, string>;
  transactions: PlannedTransaction[];
  gasUsed: string;
  verifiedCircuitKeys: number;
}
interface TransactionRecord {
  hash: string;
  request: {
    nonce: number;
    to?: string;
    data: string;
    value: string;
    chainId: number;
    type: number;
    gasLimit: string;
    gasPrice: string;
  };
  receipt?: providers.TransactionReceipt;
  costWei?: string;
}
interface Journal {
  network: string;
  chainId: number;
  deployer: string;
  owner: string;
  planHash: string;
  status: string;
  startingBalanceBNB: string;
  transactions: TransactionRecord[];
  gasUsed?: string;
  totalCostBNB?: string;
  remainingBalanceBNB?: string;
  verifiedCircuitKeys?: number;
  runtimeHashes?: Record<string, string>;
}

function write(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, `${JSON.stringify(data, null, 2)}\n`);
  fs.renameSync(`${file}.tmp`, file);
}

function sameAddress(actual: string, expected: string) {
  assert.equal(actual.toLowerCase(), expected.toLowerCase());
}

async function verify(contracts: Contracts, expectedHashes?: Record<string, string>) {
  const { ethers } = hre;
  const provider = ethers.provider;
  const railgun = await ethers.getContractAt('RailgunSmartWallet', contracts.proxy);
  const proxyAdmin = await ethers.getContractAt('ProxyAdmin', contracts.proxyAdmin);
  const delegator = await ethers.getContractAt('Delegator', contracts.delegator);
  const treasury = await ethers.getContractAt('Treasury', contracts.treasuryProxy);
  sameAddress(await railgun.owner(), contracts.delegator);
  sameAddress(await proxyAdmin.owner(), contracts.delegator);
  sameAddress(await delegator.owner(), OWNER);
  sameAddress(await railgun.bundler(), BUNDLER);
  sameAddress(await railgun.treasury(), contracts.treasuryProxy);
  assert((await railgun.shieldFee()).isZero());
  assert((await railgun.unshieldFee()).isZero());
  assert((await railgun.nftFee()).isZero());
  assert(await treasury.hasRole(await treasury.DEFAULT_ADMIN_ROLE(), contracts.delegator));
  const selector = ethers.utils.id('upgrade(address,address)').slice(0, 10);
  assert(await delegator.checkPermission(OWNER, contracts.proxyAdmin, selector));
  assert(!(await delegator.checkPermission(DEPLOYER, contracts.proxyAdmin, selector)));
  const slot = (name: string) =>
    ethers.utils.hexZeroPad(
      BigNumber.from(ethers.utils.id(`eip1967.proxy.${name}`))
        .sub(1)
        .toHexString(),
      32,
    );
  for (const [proxy, implementation] of [
    [contracts.proxy, contracts.implementation],
    [contracts.treasuryProxy, contracts.treasuryImplementation],
  ]) {
    assert.equal(
      await provider.getStorageAt(proxy, slot('admin')),
      ethers.utils.hexZeroPad(contracts.proxyAdmin.toLowerCase(), 32),
    );
    assert.equal(
      await provider.getStorageAt(proxy, slot('implementation')),
      ethers.utils.hexZeroPad(implementation.toLowerCase(), 32),
    );
    assert(BigNumber.from(await provider.getStorageAt(proxy, slot('paused'))).isZero());
  }
  const circuits = listArtifacts();
  for (let index = 0; index < circuits.length; index += 4) {
    await Promise.all(
      circuits.slice(index, index + 4).map(async ({ nullifiers, commitments }) => {
        const key = await railgun.getVerificationKey(nullifiers, commitments);
        assert(
          getKeys(nullifiers, commitments).eventVKeyMatcher(key),
          `Incorrect circuit key ${nullifiers}/${commitments}`,
        );
      }),
    );
  }
  const runtimeHashes: Record<string, string> = {};
  for (const [name, address] of Object.entries(contracts)) {
    if (name === 'bundler') continue;
    const code = await provider.getCode(address);
    assert.notEqual(code, '0x', `Missing runtime: ${name}`);
    runtimeHashes[name] = ethers.utils.keccak256(code);
    if (expectedHashes)
      assert.equal(runtimeHashes[name], expectedHashes[name], `Runtime mismatch: ${name}`);
  }
  console.log(
    `Verified ${Object.keys(runtimeHashes).length} runtimes, ${
      circuits.length
    } circuit keys, ownership, permissions, fees and proxies`,
  );
  return { runtimeHashes, verifiedCircuitKeys: circuits.length };
}

async function checkReferenceOwner() {
  const { ethers } = hre;
  const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'deployments/base.json'), 'utf8'));
  const provider = new ethers.providers.JsonRpcProvider({
    url: 'https://mainnet.base.org',
    timeout: 20000,
  });
  assert.equal((await provider.getNetwork()).chainId, 8453);
  const delegator = new ethers.Contract(
    base.contracts.delegator,
    ['function owner() view returns(address)'],
    provider,
  );
  sameAddress(await delegator.owner(), OWNER);
  return {
    chainId: 8453,
    proxy: base.contracts.proxy,
    delegator: base.contracts.delegator,
    delegatorOwner: OWNER,
  };
}

async function simulate() {
  assert.equal(hre.network.name, 'hardhat');
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  sameAddress(deployer.address, DEPLOYER);
  assert.equal((await ethers.provider.getNetwork()).chainId, 56);
  assert.equal(await deployer.getTransactionCount('pending'), 0);
  const metadata = await hre.network.provider.send('hardhat_metadata');
  assert.equal(metadata.chainId, 56);
  if (metadata.forkedNetwork) assert.equal(metadata.forkedNetwork.chainId, 56);
  await checkReferenceOwner();
  const hashes: string[] = [];
  const send = hre.network.provider.send.bind(hre.network.provider);
  hre.network.provider.send = async (method: string, params: unknown[]) => {
    const result = await send(method, params);
    if (method === 'eth_sendRawTransaction' || method === 'eth_sendTransaction')
      hashes.push(result);
    return result;
  };
  const config = await hre.run('deploy:no_governance', { bundler: BUNDLER });
  const delegator = await ethers.getContractAt('Delegator', config.delegator);
  await (await delegator.transferOwnership(OWNER)).wait();
  const contracts = {
    poseidonT3: ethers.utils.getContractAddress({ from: DEPLOYER, nonce: 0 }),
    poseidonT4: ethers.utils.getContractAddress({ from: DEPLOYER, nonce: 1 }),
    delegator: config.delegator,
    treasuryImplementation: config.treasuryImplementation,
    proxyAdmin: config.proxyAdmin,
    treasuryProxy: config.treasuryProxy,
    proxy: config.proxy,
    implementation: config.implementation,
    bundler: BUNDLER,
  };
  const checks = await verify(contracts);
  const transactions: PlannedTransaction[] = [];
  let gasUsed = BigNumber.from(0);
  for (const hash of hashes) {
    const [tx, receipt] = await Promise.all([
      ethers.provider.getTransaction(hash),
      ethers.provider.getTransactionReceipt(hash),
    ]);
    assert.equal(receipt.status, 1);
    assert.equal(tx.nonce, transactions.length);
    assert(tx.value.isZero());
    transactions.push({
      nonce: tx.nonce,
      to: tx.to ?? null,
      data: tx.data,
      value: '0',
      gasUsed: receipt.gasUsed.toString(),
    });
    gasUsed = gasUsed.add(receipt.gasUsed);
  }
  assert.equal(transactions.length, 109);
  const plan: Plan = {
    chainId: 56,
    simulationMode: metadata.forkedNetwork ? 'fork' : 'local',
    forkBlockNumber: metadata.forkedNetwork?.forkBlockNumber,
    forkBlockHash: metadata.forkedNetwork?.forkBlockHash,
    deployer: DEPLOYER,
    owner: OWNER,
    bundler: BUNDLER,
    contracts,
    ...checks,
    transactions,
    gasUsed: gasUsed.toString(),
  };
  write(PLAN_PATH, plan);
  console.log(
    JSON.stringify({
      status: 'simulated',
      chainId: 56,
      transactions: transactions.length,
      gasUsed: plan.gasUsed,
      planHash: ethers.utils.id(JSON.stringify(plan)),
      planPath: PLAN_PATH,
    }),
  );
}

async function deploy() {
  assert.equal(hre.network.name, 'bnb');
  const { ethers } = hre;
  const provider = new ethers.providers.JsonRpcProvider({
    url: process.env.BNB_RPC_URL ?? 'https://bsc-dataseed.bnbchain.org',
    timeout: 20000,
  });
  provider.pollingInterval = 1000;
  patchProviderForContractCreation(provider);
  assert.equal((await provider.getNetwork()).chainId, 56);
  const signer = new Wallet(process.env.PRIVATE_KEY!, provider);
  sameAddress(signer.address, DEPLOYER);
  const plan: Plan = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8'));
  assert.equal(plan.chainId, 56);
  sameAddress(plan.deployer, DEPLOYER);
  sameAddress(plan.owner, OWNER);
  sameAddress(plan.bundler, BUNDLER);
  assert.equal(plan.transactions.length, 109);
  const planHash = ethers.utils.id(JSON.stringify(plan));
  const baseReference = await checkReferenceOwner();
  const balance = await signer.getBalance();
  const gasPrice = await provider.getGasPrice();
  assert(gasPrice.lte(MAX_GAS_PRICE), 'Gas price exceeds 0.1 gwei cap');
  const existing: Journal | undefined = fs.existsSync(JOURNAL_PATH)
    ? JSON.parse(fs.readFileSync(JOURNAL_PATH, 'utf8'))
    : undefined;
  if (existing)
    assert.equal(existing.planHash, planHash, 'Saved plan differs from transaction journal');
  if (fs.existsSync(ARTIFACT_PATH))
    assert(existing, 'Deployment artifact exists without a journal');
  const remaining = plan.transactions.slice(
    existing?.transactions.filter((tx) => tx.receipt).length ?? 0,
  );
  const estimated = remaining
    .reduce((sum, tx) => sum.add(tx.gasUsed), BigNumber.from(0))
    .mul(gasPrice);
  const preflight = {
    status: balance.gte(estimated.mul(12).div(10)) ? 'ready' : 'awaiting-funding',
    network: 'bnb',
    chainId: 56,
    checkedAt: new Date().toISOString(),
    checkedAtBlock: await provider.getBlockNumber(),
    deployer: DEPLOYER,
    owner: OWNER,
    bundler: BUNDLER,
    balanceBNB: ethers.utils.formatEther(balance),
    estimatedRemainingCostBNB: ethers.utils.formatEther(estimated),
    gasPriceGwei: ethers.utils.formatUnits(gasPrice, 'gwei'),
    budgetBNB: ethers.utils.formatEther(BUDGET),
    simulationMode: plan.simulationMode,
    simulatedTransactions: plan.transactions.length,
    simulatedGasUsed: plan.gasUsed,
    simulatedCircuitKeys: plan.verifiedCircuitKeys,
    expectedContracts: plan.contracts,
    deploymentPlanHash: planHash,
  };
  write(path.join(ROOT, 'deployments/bnb-preflight.json'), preflight);
  console.log(
    JSON.stringify({
      status: 'preflight',
      deployer: DEPLOYER,
      owner: OWNER,
      chainId: 56,
      balanceBNB: ethers.utils.formatEther(balance),
      gasPriceGwei: ethers.utils.formatUnits(gasPrice, 'gwei'),
      estimatedRemainingCostBNB: ethers.utils.formatEther(estimated),
      budgetBNB: ethers.utils.formatEther(BUDGET),
      broadcast: process.env.BNB_DEPLOY_BROADCAST === '1',
    }),
  );
  if (process.env.BNB_DEPLOY_BROADCAST !== '1') return;
  assert(
    balance.gte(estimated.mul(12).div(10)),
    'Insufficient BNB balance for estimate plus 20% buffer',
  );
  const journal: Journal = existing ?? {
    network: 'bnb',
    chainId: 56,
    deployer: DEPLOYER,
    owner: OWNER,
    planHash,
    status: 'deploying',
    startingBalanceBNB: ethers.utils.formatEther(balance),
    transactions: [],
  };
  if (!existing) {
    assert.equal(
      await signer.getTransactionCount('pending'),
      0,
      'Signer has unrecorded transactions',
    );
    for (const [name, address] of Object.entries(plan.contracts)) {
      if (name !== 'bundler')
        assert.equal(await provider.getCode(address), '0x', `Address already deployed: ${name}`);
    }
  }
  write(JOURNAL_PATH, journal);
  for (const transaction of plan.transactions) {
    let record = journal.transactions[transaction.nonce];
    if (record?.receipt) {
      assert.equal(record.receipt.status, 1);
      const confirmed = await provider.getTransactionReceipt(record.hash);
      assert(
        confirmed && confirmed.blockHash === record.receipt.blockHash,
        'Recorded receipt changed',
      );
      continue;
    }
    if (!record) {
      assert.equal(
        await signer.getTransactionCount('pending'),
        transaction.nonce,
        'Unexpected signer nonce',
      );
      const price = await provider.getGasPrice();
      assert(price.lte(MAX_GAS_PRICE), 'Gas price exceeds 0.1 gwei cap');
      const request = {
        nonce: transaction.nonce,
        ...(transaction.to ? { to: transaction.to } : {}),
        data: transaction.data,
        value: '0x00',
        chainId: 56,
        type: 0,
        gasLimit: '0x00',
        gasPrice: price.toHexString(),
      };
      const estimate = await signer.estimateGas({ ...request, gasLimit: undefined });
      assert(
        estimate.lte(BigNumber.from(transaction.gasUsed).mul(2)),
        'Gas estimate differs significantly from simulation',
      );
      request.gasLimit = estimate.mul(12).div(10).toHexString();
      const spent = journal.transactions.reduce(
        (sum, tx) => sum.add(tx.costWei ?? 0),
        BigNumber.from(0),
      );
      assert(
        spent.add(BigNumber.from(request.gasLimit).mul(price)).lte(BUDGET),
        'Deployment would exceed 0.011 BNB budget',
      );
      const raw = await signer.signTransaction(request);
      record = { hash: ethers.utils.keccak256(raw), request };
      journal.transactions.push(record);
      write(JOURNAL_PATH, journal);
    }
    let receipt = await provider.getTransactionReceipt(record.hash);
    if (!receipt) {
      const pending = await provider.getTransaction(record.hash);
      if (!pending) {
        assert.equal(
          await signer.getTransactionCount('latest'),
          transaction.nonce,
          'Recorded transaction missing but nonce consumed',
        );
        const raw = await signer.signTransaction(record.request);
        assert.equal(ethers.utils.keccak256(raw), record.hash);
        await provider.sendTransaction(raw);
      }
      receipt = await provider.waitForTransaction(record.hash, 2, 180000);
    }
    assert(receipt && receipt.status === 1, `Failed transaction ${record.hash}`);
    record.receipt = receipt;
    record.costWei = receipt.gasUsed.mul(receipt.effectiveGasPrice).toString();
    write(JOURNAL_PATH, journal);
    console.log(`Confirmed ${transaction.nonce + 1}/${plan.transactions.length}: ${record.hash}`);
  }
  const checks = await verify(plan.contracts, plan.runtimeHashes);
  journal.status = 'deployed';
  journal.gasUsed = journal.transactions
    .reduce((sum, tx) => sum.add(tx.receipt!.gasUsed), BigNumber.from(0))
    .toString();
  journal.totalCostBNB = ethers.utils.formatEther(
    journal.transactions.reduce((sum, tx) => sum.add(tx.costWei!), BigNumber.from(0)),
  );
  journal.remainingBalanceBNB = ethers.utils.formatEther(await signer.getBalance());
  journal.verifiedCircuitKeys = checks.verifiedCircuitKeys;
  journal.runtimeHashes = checks.runtimeHashes;
  write(JOURNAL_PATH, journal);
  write(ARTIFACT_PATH, {
    network: 'bnb',
    chainId: 56,
    status: 'deployed',
    deployer: DEPLOYER,
    contracts: plan.contracts,
    ownership: {
      delegatorOwner: OWNER,
      transactionHash: journal.transactions[108].hash,
      baseReference,
    },
    rpcUrl: 'https://bsc-dataseed.bnbchain.org',
    blockExplorerUrl: 'https://bscscan.com',
    fees: { shield: '0', unshield: '0', nft: '0' },
    verification: {
      runtimeBytecodeContracts: Object.keys(checks.runtimeHashes).length,
      circuitKeys: checks.verifiedCircuitKeys,
      sourceVerificationPerformed: false,
      verifiedAtBlock: await provider.getBlockNumber(),
    },
    deploymentPlanHash: planHash,
    simulation: {
      mode: plan.simulationMode,
      forkBlockNumber: plan.forkBlockNumber,
      forkBlockHash: plan.forkBlockHash,
      gasUsed: plan.gasUsed,
      transactions: plan.transactions.length,
    },
    gasCostBNB: journal.totalCostBNB,
    remainingDeployerBNB: journal.remainingBalanceBNB,
  });
  write(path.join(ROOT, 'deployments/bnb-preflight.json'), {
    ...preflight,
    status: 'deployed',
    completedAt: new Date().toISOString(),
    remainingBalanceBNB: journal.remainingBalanceBNB,
  });
  console.log(
    JSON.stringify({
      status: journal.status,
      vault: plan.contracts.proxy,
      owner: OWNER,
      transactions: journal.transactions.length,
      gasCostBNB: journal.totalCostBNB,
      remainingBalanceBNB: journal.remainingBalanceBNB,
    }),
  );
}

(hre.network.name === 'hardhat' ? simulate() : deploy()).catch((error) => {
  const message = error instanceof Error ? error.message : 'Deployment failed';
  console.error(message.split(process.env.PRIVATE_KEY ?? '__no_key__').join('[REDACTED]'));
  process.exitCode = 1;
});
