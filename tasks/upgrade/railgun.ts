import { task } from 'hardhat/config';
import type { providers } from 'ethers';
import fs from 'node:fs';
import path from 'node:path';

import { patchProviderForContractCreation } from '../deploy/shared';

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

interface UpgradeRailgunArgs {
  implementation?: string;
}

interface UpgradeRailgunResult {
  network: string;
  proxy: string;
  oldImplementation: string;
  newImplementation: string;
  artifactPath: string;
  transactionHash?: string;
}

const PROXY_ADMIN_SLOT = '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103';
const IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';

/**
 * Loads a network-scoped deployment artifact.
 * @param networkName - Hardhat network name.
 * @returns Parsed deployment artifact and path.
 */
function loadArtifact(networkName: string): { artifact: DeploymentArtifact; path: string } {
  const pathToArtifact = path.join(__dirname, '..', '..', 'deployments', `${networkName}.json`);
  if (!fs.existsSync(pathToArtifact)) {
    throw new Error(`No deployment artifact at ${pathToArtifact}. Run deploy:no_governance first.`);
  }
  return {
    artifact: JSON.parse(fs.readFileSync(pathToArtifact, 'utf8')) as DeploymentArtifact,
    path: pathToArtifact,
  };
}

/**
 * Extracts an address from a 32-byte storage slot.
 * @param value - Raw storage slot value.
 * @param getAddress - Address checksum function.
 * @returns Checksummed address.
 */
function storageSlotAddress(value: string, getAddress: (address: string) => string): string {
  return getAddress(`0x${value.slice(-40)}`);
}

/**
 * Checks that an artifact address has deployed bytecode.
 * @param provider - Ethers provider.
 * @param label - Error label.
 * @param address - Address to check.
 * @returns Promise that resolves when code exists.
 */
async function requireContractCode(
  provider: providers.Provider,
  label: string,
  address: string,
): Promise<void> {
  const code = await provider.getCode(address);
  if (code === '0x') throw new Error(`${label} ${address} has no code on the active network`);
}

task(
  'upgrade:railgun',
  'Deploys and upgrades RailgunSmartWallet through deployments/<network>.json',
)
  .addOptionalParam('implementation', 'Existing RailgunSmartWallet implementation address')
  .setAction(async function (
    { implementation }: UpgradeRailgunArgs,
    hre,
  ): Promise<UpgradeRailgunResult> {
    const { ethers } = hre;
    await hre.run('compile');
    patchProviderForContractCreation(ethers.provider);

    const signers = await ethers.getSigners();
    if (signers.length === 0) throw new Error(`No signer configured for ${hre.network.name}`);
    const signer = signers[0];

    const networkName = hre.network.name;
    const { artifact, path: pathToArtifact } = loadArtifact(networkName);
    if (artifact.network !== networkName) {
      throw new Error(
        `Deployment artifact network ${artifact.network} does not match Hardhat network ${networkName}`,
      );
    }

    const chainIdHex = (await ethers.provider.send('eth_chainId', [])) as string;
    const chainId = Number(BigInt(chainIdHex));
    if (artifact.chainId !== chainId) {
      throw new Error(
        `Deployment artifact chainId ${artifact.chainId} does not match RPC chainId ${chainId}`,
      );
    }
    if (
      hre.network.config.chainId !== undefined &&
      hre.network.config.chainId !== artifact.chainId
    ) {
      throw new Error(
        `Deployment artifact chainId ${artifact.chainId} does not match Hardhat config chainId ${hre.network.config.chainId}`,
      );
    }

    const c = artifact.contracts;
    const proxy = ethers.utils.getAddress(c.proxy);
    const proxyAdminAddress = ethers.utils.getAddress(c.proxyAdmin);
    const delegatorAddress = ethers.utils.getAddress(c.delegator);
    const artifactImplementation = ethers.utils.getAddress(c.implementation);
    const poseidonT3 = ethers.utils.getAddress(c.poseidonT3);
    const poseidonT4 = ethers.utils.getAddress(c.poseidonT4);

    await requireContractCode(ethers.provider, 'Railgun proxy', proxy);
    await requireContractCode(ethers.provider, 'ProxyAdmin', proxyAdminAddress);
    await requireContractCode(ethers.provider, 'Delegator', delegatorAddress);

    const proxyAdminSlot = await ethers.provider.getStorageAt(proxy, PROXY_ADMIN_SLOT);
    const proxyAdminSlotAddress = storageSlotAddress(proxyAdminSlot, ethers.utils.getAddress);
    if (proxyAdminSlotAddress !== proxyAdminAddress) {
      throw new Error(
        `Proxy admin slot ${proxyAdminSlotAddress} does not match artifact proxyAdmin ${proxyAdminAddress}`,
      );
    }

    const oldImplementationSlot = await ethers.provider.getStorageAt(proxy, IMPLEMENTATION_SLOT);
    const oldImplementation = storageSlotAddress(oldImplementationSlot, ethers.utils.getAddress);
    if (oldImplementation !== artifactImplementation) {
      throw new Error(
        `Proxy implementation ${oldImplementation} does not match artifact implementation ${artifactImplementation}`,
      );
    }

    const proxyAdmin = await ethers.getContractAt('ProxyAdmin', proxyAdminAddress);
    const delegator = await ethers.getContractAt('Delegator', delegatorAddress);
    const proxyAdminOwner = await proxyAdmin.callStatic.owner();
    if (proxyAdminOwner !== delegatorAddress) {
      throw new Error(
        `ProxyAdmin owner ${proxyAdminOwner} does not match artifact delegator ${delegatorAddress}`,
      );
    }

    const upgradeSelector = proxyAdmin.interface.getSighash('upgrade');
    const allowed = await delegator.callStatic.checkPermission(
      signer.address,
      proxyAdminAddress,
      upgradeSelector,
    );
    if (!allowed) {
      throw new Error(
        `Signer ${signer.address} is not allowed to upgrade ${proxy} through delegator ${delegatorAddress}`,
      );
    }

    let newImplementation: string;
    if (implementation) {
      newImplementation = ethers.utils.getAddress(implementation);
      await requireContractCode(
        ethers.provider,
        'RailgunSmartWallet implementation',
        newImplementation,
      );
    } else {
      await requireContractCode(ethers.provider, 'PoseidonT3', poseidonT3);
      await requireContractCode(ethers.provider, 'PoseidonT4', poseidonT4);
      const RailgunSmartWallet = await ethers.getContractFactory('RailgunSmartWallet', {
        libraries: {
          PoseidonT3: poseidonT3,
          PoseidonT4: poseidonT4,
        },
      });
      const deployedImplementation = await RailgunSmartWallet.deploy();
      await deployedImplementation.deployed();
      newImplementation = deployedImplementation.address;
      console.log(`\nDeployed RailgunSmartWallet implementation ${newImplementation}`);
    }

    const result: UpgradeRailgunResult = {
      network: networkName,
      proxy,
      oldImplementation,
      newImplementation,
      artifactPath: pathToArtifact,
    };

    if (newImplementation === oldImplementation) {
      console.log(`\nRailgun proxy already uses implementation ${newImplementation}`);
      return result;
    }

    const upgradeData = proxyAdmin.interface.encodeFunctionData('upgrade', [
      proxy,
      newImplementation,
    ]);
    const [simulationSuccess, simulationReturnData] = await delegator.callStatic.callContract(
      proxyAdminAddress,
      upgradeData,
      0,
    );
    if (!simulationSuccess) {
      throw new Error(`Delegator upgrade simulation failed: ${simulationReturnData}`);
    }

    console.log('\nUpgrading Railgun proxy');
    console.log({
      network: networkName,
      chainId,
      signer: signer.address,
      delegator: delegatorAddress,
      proxyAdmin: proxyAdminAddress,
      proxy,
      oldImplementation,
      newImplementation,
    });

    const tx = await delegator.callContract(proxyAdminAddress, upgradeData, 0);
    const receipt = await tx.wait();
    const actualImplementation = storageSlotAddress(
      await ethers.provider.getStorageAt(proxy, IMPLEMENTATION_SLOT, receipt.blockNumber),
      ethers.utils.getAddress,
    );
    if (actualImplementation !== newImplementation) {
      throw new Error(
        `Upgrade transaction ${receipt.transactionHash} left implementation ${actualImplementation}, expected ${newImplementation}`,
      );
    }

    artifact.contracts.implementation = newImplementation;
    fs.writeFileSync(pathToArtifact, `${JSON.stringify(artifact, null, 2)}\n`);
    console.log(`\nWrote deployment artifact to ${pathToArtifact}`);

    return {
      ...result,
      transactionHash: receipt.transactionHash,
    };
  });
