import hre, { ethers } from 'hardhat';
import { expect } from 'chai';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import fs from 'node:fs';
import path from 'node:path';

const HARDHAT_DEPLOYMENT_PATH = path.join(__dirname, '..', '..', 'deployments', 'hardhat.json');
const IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';

interface NoGovernanceDeployConfig {
  bundler: string;
  delegator: string;
  implementation: string;
  proxy: string;
  proxyAdmin: string;
  treasuryImplementation: string;
  treasuryProxy: string;
}

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

interface UpgradeRailgunResult {
  network: string;
  proxy: string;
  oldImplementation: string;
  newImplementation: string;
  artifactPath: string;
}

/**
 * Writes the temporary hardhat deployment artifact used by upgrade task tests.
 * @param artifact - Deployment artifact.
 * @returns Temporary artifact path.
 */
function writeHardhatArtifact(artifact: DeploymentArtifact): string {
  fs.writeFileSync(HARDHAT_DEPLOYMENT_PATH, `${JSON.stringify(artifact, null, 2)}\n`);
  return HARDHAT_DEPLOYMENT_PATH;
}

/**
 * Reads the temporary hardhat deployment artifact.
 * @returns Parsed deployment artifact.
 */
function readArtifact(): DeploymentArtifact {
  return JSON.parse(fs.readFileSync(HARDHAT_DEPLOYMENT_PATH, 'utf8')) as DeploymentArtifact;
}

/**
 * Extracts an address from a 32-byte storage slot.
 * @param value - Raw storage slot value.
 * @returns Checksummed address.
 */
function storageSlotAddress(value: string): string {
  return ethers.utils.getAddress(`0x${value.slice(-40)}`);
}

/**
 * Deploys a local no-governance setup and writes artifact-compatible addresses.
 * @returns Local deployment artifact and deploy task output.
 */
async function deployLocalArtifactFixture() {
  const [deployer, bundler] = await ethers.getSigners();
  const deployConfig = (await hre.run('deploy:no_governance', {
    bundler: bundler.address,
  })) as NoGovernanceDeployConfig;

  const PoseidonT3 = await ethers.getContractFactory('PoseidonT3');
  const poseidonT3 = await PoseidonT3.deploy();
  await poseidonT3.deployed();

  const PoseidonT4 = await ethers.getContractFactory('PoseidonT4');
  const poseidonT4 = await PoseidonT4.deploy();
  await poseidonT4.deployed();

  const network = await ethers.provider.getNetwork();
  const artifact: DeploymentArtifact = {
    network: 'hardhat',
    chainId: network.chainId,
    deployer: deployer.address,
    contracts: {
      poseidonT3: poseidonT3.address,
      poseidonT4: poseidonT4.address,
      delegator: deployConfig.delegator,
      treasuryImplementation: deployConfig.treasuryImplementation,
      proxyAdmin: deployConfig.proxyAdmin,
      treasuryProxy: deployConfig.treasuryProxy,
      proxy: deployConfig.proxy,
      implementation: deployConfig.implementation,
      bundler: deployConfig.bundler,
    },
  };

  return { artifact, deployConfig };
}

describe('Tasks/Upgrade', () => {
  let originalArtifact: string | undefined;

  beforeEach(() => {
    originalArtifact = fs.existsSync(HARDHAT_DEPLOYMENT_PATH)
      ? fs.readFileSync(HARDHAT_DEPLOYMENT_PATH, 'utf8')
      : undefined;
  });

  afterEach(() => {
    if (originalArtifact === undefined) {
      if (fs.existsSync(HARDHAT_DEPLOYMENT_PATH)) fs.unlinkSync(HARDHAT_DEPLOYMENT_PATH);
    } else {
      fs.writeFileSync(HARDHAT_DEPLOYMENT_PATH, originalArtifact);
    }
  });

  it('rejects a deployment artifact for a different network', async () => {
    const { artifact } = await loadFixture(deployLocalArtifactFixture);
    writeHardhatArtifact({
      ...artifact,
      network: 'base',
      chainId: 8453,
    });

    await expect(hre.run('upgrade:railgun')).to.be.rejectedWith(
      'Deployment artifact network base does not match Hardhat network hardhat',
    );
  });

  it('upgrades the active network proxy through the delegator and updates its artifact', async () => {
    const { artifact, deployConfig } = await loadFixture(deployLocalArtifactFixture);
    const artifactPath = writeHardhatArtifact(artifact);

    const oldSlot = await ethers.provider.getStorageAt(
      artifact.contracts.proxy,
      IMPLEMENTATION_SLOT,
    );
    expect(storageSlotAddress(oldSlot)).to.equal(deployConfig.implementation);

    const result = (await hre.run('upgrade:railgun')) as UpgradeRailgunResult;
    const updatedArtifact = readArtifact();
    const newSlot = await ethers.provider.getStorageAt(
      artifact.contracts.proxy,
      IMPLEMENTATION_SLOT,
    );

    expect(result.network).to.equal('hardhat');
    expect(result.proxy).to.equal(artifact.contracts.proxy);
    expect(result.oldImplementation).to.equal(deployConfig.implementation);
    expect(result.newImplementation).to.not.equal(deployConfig.implementation);
    expect(result.artifactPath).to.equal(artifactPath);
    expect(updatedArtifact.contracts.implementation).to.equal(result.newImplementation);
    expect(storageSlotAddress(newSlot)).to.equal(result.newImplementation);

    const proxyAdmin = await ethers.getContractAt('ProxyAdmin', artifact.contracts.proxyAdmin);
    const delegator = await ethers.getContractAt('Delegator', artifact.contracts.delegator);
    expect(await proxyAdmin.owner()).to.equal(artifact.contracts.delegator);
    expect(await delegator.owner()).to.equal(artifact.deployer);
  });

  it('can upgrade to an already deployed implementation for the active network', async () => {
    const { artifact } = await loadFixture(deployLocalArtifactFixture);
    writeHardhatArtifact(artifact);

    const RailgunSmartWallet = await ethers.getContractFactory('RailgunSmartWallet', {
      libraries: {
        PoseidonT3: artifact.contracts.poseidonT3,
        PoseidonT4: artifact.contracts.poseidonT4,
      },
    });
    const implementation = await RailgunSmartWallet.deploy();
    await implementation.deployed();

    const result = (await hre.run('upgrade:railgun', {
      implementation: implementation.address,
    })) as UpgradeRailgunResult;

    const updatedArtifact = readArtifact();
    const newSlot = await ethers.provider.getStorageAt(
      artifact.contracts.proxy,
      IMPLEMENTATION_SLOT,
    );

    expect(result.newImplementation).to.equal(implementation.address);
    expect(updatedArtifact.contracts.implementation).to.equal(implementation.address);
    expect(storageSlotAddress(newSlot)).to.equal(implementation.address);
  });
});
