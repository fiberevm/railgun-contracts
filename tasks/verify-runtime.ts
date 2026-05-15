import { task } from 'hardhat/config';
import fs from 'node:fs';
import path from 'node:path';

interface DeploymentArtifact {
  network: string;
  chainId: number;
  deployer: string;
  contracts: {
    poseidonT3: string;
    poseidonT4: string;
    delegator: string;
    treasuryImplementation: string;
    proxyAdmin: string;
    treasuryProxy: string;
    proxy: string;
    implementation: string;
    bundler: string;
  };
}

function loadArtifact(networkName: string): DeploymentArtifact {
  const artifactPath = path.join(__dirname, '..', 'deployments', `${networkName}.json`);
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`No deployment artifact at ${artifactPath}. Run deploy:no_governance first.`);
  }
  return JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
}

const PROXY_ADMIN_SLOT = '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103';
const IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';

function check(label: string, expected: string, actual: string): void {
  const ok = expected.toLowerCase() === actual.toLowerCase();
  console.log(`  ${ok ? 'OK' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`        expected ${expected}, got ${actual}`);
}

task(
  'verify:runtime',
  'Runs post-deploy sanity checks against deployments/<network>.json',
).setAction(async function (_args, hre) {
  const { ethers } = hre;
  const artifact = loadArtifact(hre.network.name);
  const c = artifact.contracts;

  console.log(`\nRuntime checks for ${artifact.network} (chainId ${artifact.chainId})`);

  const proxyAdmin = await ethers.getContractAt('ProxyAdmin', c.proxyAdmin);
  const railgun = await ethers.getContractAt('RailgunSmartWallet', c.proxy);
  const treasury = await ethers.getContractAt('Treasury', c.treasuryProxy);

  console.log('\nOwnership:');
  check('proxyAdmin.owner == delegator', c.delegator, await proxyAdmin.callStatic.owner());
  check('railgun.owner == delegator', c.delegator, await railgun.callStatic.owner());

  console.log('\nProxy storage slots:');
  const railgunAdminSlot = await railgun.provider.getStorageAt(c.proxy, PROXY_ADMIN_SLOT);
  check(
    'railgun proxy admin slot == proxyAdmin',
    `0x${'0'.repeat(24)}${c.proxyAdmin.slice(2).toLowerCase()}`,
    railgunAdminSlot,
  );
  const treasuryAdminSlot = await treasury.provider.getStorageAt(
    c.treasuryProxy,
    PROXY_ADMIN_SLOT,
  );
  check(
    'treasury proxy admin slot == proxyAdmin',
    `0x${'0'.repeat(24)}${c.proxyAdmin.slice(2).toLowerCase()}`,
    treasuryAdminSlot,
  );
  const treasuryImplSlot = await treasury.provider.getStorageAt(c.treasuryProxy, IMPL_SLOT);
  check(
    'treasury impl slot == treasuryImplementation',
    `0x${'0'.repeat(24)}${c.treasuryImplementation.slice(2).toLowerCase()}`,
    treasuryImplSlot,
  );

  console.log('\nFees + bundler:');
  check('shieldFee == 0', '0', (await railgun.callStatic.shieldFee()).toString());
  check('unshieldFee == 0', '0', (await railgun.callStatic.unshieldFee()).toString());
  check('nftFee == 0', '0', (await railgun.callStatic.nftFee()).toString());
  check('bundler == artifact.bundler', c.bundler, await railgun.callStatic.bundler());

  console.log('\nTreasury role:');
  const adminRole = await treasury.callStatic.DEFAULT_ADMIN_ROLE();
  const hasAdminRole = await treasury.callStatic.hasRole(adminRole, c.delegator);
  check('treasury admin role granted to delegator', 'true', hasAdminRole.toString());

  console.log('\nVerification key (1, 2):');
  const vk = await railgun.callStatic.getVerificationKey(1, 2);
  const vkLoaded = vk && vk.alpha1 && vk.alpha1.x && vk.alpha1.x.toString() !== '0';
  check('VK (1, 2) loaded', 'true', String(Boolean(vkLoaded)));

  console.log('\nDone.');
});
