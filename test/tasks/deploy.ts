import hre, { ethers } from 'hardhat';
import { expect } from 'chai';
import {
  impersonateAccount,
  loadFixture,
  setBalance,
} from '@nomicfoundation/hardhat-network-helpers';
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import { VERIFICATION_BYPASS_ADDRESS } from '../../tasks/deploy/shared';

interface BaseDeployConfig {
  bundler: string;
  delegator: string;
  governorRewardsImplementation: string;
  governorRewardsProxy: string;
  implementation: string;
  proxy: string;
  proxyAdmin: string;
  treasuryImplementation: string;
  treasuryProxy: string;
  voting: string;
}

interface FullDeployConfig extends BaseDeployConfig {
  rail: string;
  staking: string;
}

interface NoGovernanceDeployConfig extends BaseDeployConfig {
  rail: string;
  staking: string;
}

interface TestDeployConfig extends BaseDeployConfig {
  rail: string;
  staking: string;
  testERC20: string;
  testERC721: string;
  weth9: string;
}

/**
 * Returns the default local Hardhat signers used by task tests.
 * @returns Typed local signers.
 */
async function getTaskSigners(): Promise<SignerWithAddress[]> {
  return ethers.getSigners();
}

/**
 * Runs the local deploy:test task and returns the deployed wallet.
 * @returns Test deployment config and wallet contract.
 */
async function deployTestFixture() {
  const config = (await hre.run('deploy:test')) as TestDeployConfig;
  const railgun = await ethers.getContractAt('RailgunSmartWallet', config.proxy);

  return {
    deployConfig: config,
    railgun,
  };
}

/**
 * Runs the local deploy:no_governance task with two seeded users.
 * @returns Deployment config, wallet contract, and proxy admin.
 */
async function deployNoGovernanceFixture() {
  const signers = await getTaskSigners();
  const deployer = signers[0];
  const additionalUser = signers[1];
  const config = (await hre.run('deploy:no_governance', {
    bundler: additionalUser.address,
  })) as NoGovernanceDeployConfig;
  const railgun = await ethers.getContractAt('RailgunSmartWallet', config.proxy);
  const proxyAdmin = await ethers.getContractAt('ProxyAdmin', config.proxyAdmin);

  return {
    deployConfig: config,
    proxyAdmin,
    railgun,
  };
}

/**
 * Runs the local deploy:full task with two seeded users.
 * @returns Deployment config, wallet contract, proxy admin, and delegator.
 */
async function deployFullFixture() {
  const signers = await getTaskSigners();
  const deployer = signers[0];
  const additionalUser = signers[1];
  const config = (await hre.run('deploy:full', {
    bundler: additionalUser.address,
    railName: 'RailTest',
    railSymbol: 'RAILTEST',
  })) as FullDeployConfig;
  const railgun = await ethers.getContractAt('RailgunSmartWallet', config.proxy);
  const proxyAdmin = await ethers.getContractAt('ProxyAdmin', config.proxyAdmin);
  const delegator = await ethers.getContractAt('Delegator', config.delegator);

  return {
    delegator,
    deployConfig: config,
    proxyAdmin,
    railgun,
  };
}

describe('Tasks/Deploy', () => {
  it('configures bundler auth and omits RelayAdapt in deploy:test', async () => {
    const signers = await getTaskSigners();
    const deployer = signers[0];
    const otherUser = signers[1];

    const { deployConfig, railgun } = await loadFixture(deployTestFixture);
    await setBalance(VERIFICATION_BYPASS_ADDRESS, '0x56BC75E2D63100000');
    await impersonateAccount(VERIFICATION_BYPASS_ADDRESS);
    const verificationBypassSigner = await ethers.getSigner(VERIFICATION_BYPASS_ADDRESS);

    expect(deployConfig).to.not.have.property('relayAdapt');
    expect(await railgun.bundler()).to.equal(deployConfig.bundler);

    await expect(railgun.connect(deployer).shield([])).to.not.be.reverted;
    await expect(railgun.connect(verificationBypassSigner).transact([])).to.not.be.reverted;
    await expect(railgun.connect(otherUser).transact([])).to.not.be.reverted;
    await expect(railgun.connect(otherUser).shield([]))
      .to.be.revertedWithCustomError(railgun, 'InvalidBundler')
      .withArgs(otherUser.address);
  });

  it('configures a usable bundler before transfer in deploy:no_governance', async () => {
    const signers = await getTaskSigners();
    const deployer = signers[0];
    const additionalUser = signers[1];

    const { deployConfig, proxyAdmin, railgun } = await loadFixture(deployNoGovernanceFixture);

    expect(deployConfig).to.not.have.property('relayAdapt');
    expect(await railgun.bundler()).to.equal(deployConfig.bundler);
    expect(await proxyAdmin.owner()).to.equal(deployConfig.delegator);

    await expect(railgun.connect(additionalUser).shield([])).to.not.be.reverted;
  });

  it('configures the bundler before governance handoff in deploy:full', async () => {
    const signers = await getTaskSigners();
    const deployer = signers[0];
    const additionalUser = signers[1];

    const { delegator, deployConfig, proxyAdmin, railgun } = await loadFixture(deployFullFixture);

    expect(deployConfig).to.not.have.property('relayAdapt');
    expect(await railgun.bundler()).to.equal(deployConfig.bundler);
    expect(await proxyAdmin.owner()).to.equal(deployConfig.delegator);
    expect(await delegator.owner()).to.equal(deployConfig.voting);

    await expect(railgun.connect(additionalUser).shield([])).to.not.be.reverted;
  });
});
