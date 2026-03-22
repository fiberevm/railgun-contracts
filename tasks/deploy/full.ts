import { task } from 'hardhat/config';

import { loadArtifacts, listArtifacts } from '../../helpers/logic/artifacts';
import {
  configureBundler,
  patchProviderForContractCreation,
  resolveBundlerConfig,
} from './shared';
import type { Contract } from 'ethers';

/**
 * Log data to verify contract
 * @param name - name of contract
 * @param contract - contract object
 * @param constructorArguments - constructor arguments
 * @returns promise resolved on deploy deployed
 */
async function logVerify(
  name: string,
  contract: Contract,
  constructorArguments: unknown[],
): Promise<null> {
  console.log(`\nDeploying ${name}`);
  await contract.deployed();
  console.log({
    address: contract.address,
    constructorArguments,
  });
  return null;
}

task('deploy:full', 'Creates full deployment')
  .addParam('railName', 'Name of Rail ERC20 governance token')
  .addParam('railSymbol', 'Symbol of Rail ERC20 governance token')
  .addOptionalParam('bundler', 'Address allowed to call shield')
  .setAction(async function (
    {
      railName,
      railSymbol,
      bundler,
    }: {
      railName: string;
      railSymbol: string;
      bundler?: string;
    },
    hre,
  ) {
    const { ethers } = hre;
    await hre.run('compile');
    const [deployer] = await ethers.getSigners();
    patchProviderForContractCreation(ethers.provider);

    // Get build artifacts
    const Delegator = await ethers.getContractFactory('Delegator');
    const PoseidonT3 = await ethers.getContractFactory('PoseidonT3');
    const PoseidonT4 = await ethers.getContractFactory('PoseidonT4');
    const Proxy = await ethers.getContractFactory('PausableUpgradableProxy');
    const ProxyAdmin = await ethers.getContractFactory('ProxyAdmin');
    const RailToken = await ethers.getContractFactory('RailTokenFixedSupply');
    const Staking = await ethers.getContractFactory('Staking');
    const TreasuryImplementation = await ethers.getContractFactory('Treasury');
    const Voting = await ethers.getContractFactory('Voting');

    // Deploy Poseidon libraries
    const poseidonT3 = await PoseidonT3.deploy();
    await logVerify('PoseidonT3', poseidonT3, []);
    const poseidonT4 = await PoseidonT4.deploy();
    await logVerify('PoseidonT4', poseidonT4, []);

    // Get Railgun Smart Wallet
    const RailgunSmartWallet = await ethers.getContractFactory('RailgunSmartWallet', {
      libraries: {
        PoseidonT3: poseidonT3.address,
        PoseidonT4: poseidonT4.address,
      },
    });

    // Deploy RailToken
    const rail = await RailToken.deploy(
      deployer.address,
      50000000n * 10n ** 18n,
      railName,
      railSymbol,
    );
    await logVerify('AdminERC20', rail, ['RailTest', 'RAILTEST']);

    // Deploy Staking
    const staking = await Staking.deploy(rail.address);
    await logVerify('Staking', staking, [rail.address]);

    // Deploy delegator
    const delegator = await Delegator.deploy(deployer.address);
    await logVerify('Delegator', delegator, [deployer.address]);

    // Deploy voting
    const voting = await Voting.deploy(staking.address, delegator.address);
    await logVerify('Voting', voting, [staking.address, delegator.address]);

    // Deploy treasury implementation
    const treasuryImplementation = await TreasuryImplementation.deploy();
    await logVerify('Treasury Implementation', treasuryImplementation, []);

    // Deploy ProxyAdmin
    const proxyAdmin = await ProxyAdmin.deploy(deployer.address);
    await logVerify('Proxy Admin', proxyAdmin, [deployer.address]);

    // Deploy treasury proxy
    const treasuryProxy = await Proxy.deploy(proxyAdmin.address);
    await logVerify('Treasury Proxy', treasuryProxy, [proxyAdmin.address]);

    // Deploy Proxy
    const proxy = await Proxy.deploy(proxyAdmin.address);
    await logVerify('Proxy', proxy, [proxyAdmin.address]);

    // Deploy Implementation
    const implementation = await RailgunSmartWallet.deploy();
    await logVerify('Implementation', implementation, []);

    // Set implementation for proxies
    console.log('\nSetting proxy implementations');
    await (await proxyAdmin.upgrade(proxy.address, implementation.address)).wait();
    await (await proxyAdmin.unpause(proxy.address)).wait();
    await (await proxyAdmin.upgrade(treasuryProxy.address, treasuryImplementation.address)).wait();
    await (await proxyAdmin.unpause(treasuryProxy.address)).wait();

    // Get proxied contracts
    const treasury = TreasuryImplementation.attach(treasuryProxy.address);
    const railgun = RailgunSmartWallet.attach(proxy.address);

    // Initialize contracts
    console.log('\nInitializing contracts');
    await (await treasury.initializeTreasury(delegator.address)).wait();
    await (
      await railgun.initializeRailgunLogic(treasuryProxy.address, 25n, 25n, 25n, deployer.address, {
        gasLimit: 2000000,
      })
    ).wait();

    // Set artifacts
    console.log('\nSetting Artifacts');
    await loadArtifacts(railgun, listArtifacts());

    const bundlerConfig = resolveBundlerConfig({
      bundlerParam: bundler,
      defaultBundler: deployer.address,
      getAddress: ethers.utils.getAddress,
    });

    console.log('\nConfiguring bundler');
    await configureBundler(railgun, bundlerConfig);

    // Transfer contract ownerships
    console.log('\nTransferring ownerships');
    await (await railgun.transferOwnership(delegator.address)).wait();
    await (await proxyAdmin.transferOwnership(delegator.address)).wait();
    await (await delegator.transferOwnership(voting.address)).wait();

    const deployConfig = {
      delegator: delegator.address,
      governorRewardsImplementation: '',
      governorRewardsProxy: '',
      implementation: implementation.address,
      proxy: proxy.address,
      proxyAdmin: proxyAdmin.address,
      rail: rail.address,
      staking: staking.address,
      treasuryImplementation: treasuryImplementation.address,
      treasuryProxy: treasuryProxy.address,
      voting: voting.address,
      bundler: bundlerConfig.bundler,
    };

    console.log('\nDEPLOY CONFIG:');
    console.log(deployConfig);
    return deployConfig;
  });
