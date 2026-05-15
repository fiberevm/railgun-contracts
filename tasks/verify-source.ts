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

async function verify(
  hre: { run: (task: string, args: Record<string, unknown>) => Promise<void> },
  name: string,
  args: Record<string, unknown>,
): Promise<void> {
  console.log(`\nVerifying ${name} at ${args.address}`);
  try {
    await hre.run('verify:verify', args);
    console.log(`  OK`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes('already verified')) {
      console.log(`  already verified`);
      return;
    }
    console.error(`  FAILED: ${msg}`);
  }
}

task(
  'verify:source',
  'Verifies all deployed contracts on the block explorer using deployments/<network>.json',
).setAction(async function (_args, hre) {
  const networkName = hre.network.name;
  const artifact = loadArtifact(networkName);
  const { contracts, deployer } = artifact;

  await verify(hre, 'PoseidonT3', { address: contracts.poseidonT3 });
  await verify(hre, 'PoseidonT4', { address: contracts.poseidonT4 });
  await verify(hre, 'Delegator', {
    address: contracts.delegator,
    constructorArguments: [deployer],
  });
  await verify(hre, 'Treasury (implementation)', { address: contracts.treasuryImplementation });
  await verify(hre, 'ProxyAdmin', {
    address: contracts.proxyAdmin,
    constructorArguments: [deployer],
  });
  await verify(hre, 'Treasury Proxy', {
    address: contracts.treasuryProxy,
    constructorArguments: [contracts.proxyAdmin],
    contract: 'contracts/proxy/Proxy.sol:PausableUpgradableProxy',
  });
  await verify(hre, 'Railgun Proxy', {
    address: contracts.proxy,
    constructorArguments: [contracts.proxyAdmin],
    contract: 'contracts/proxy/Proxy.sol:PausableUpgradableProxy',
  });
  await verify(hre, 'RailgunSmartWallet (implementation)', {
    address: contracts.implementation,
    libraries: {
      PoseidonT3: contracts.poseidonT3,
      PoseidonT4: contracts.poseidonT4,
    },
  });
});
