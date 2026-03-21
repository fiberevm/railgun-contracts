import { ethers } from 'hardhat';
import { expect } from 'chai';
import {
  loadFixture,
  setBalance,
  impersonateAccount,
} from '@nomicfoundation/hardhat-network-helpers';

import { loadArtifacts, listArtifacts } from '../../helpers/logic/artifacts';
import { randomBytes } from '../../helpers/global/crypto';
import { Note, TokenData, TokenType } from '../../helpers/logic/note';

describe('Logic/BundlerShield', () => {
  async function deploy() {
    await setBalance('0x000000000000000000000000000000000000dEaD', '0x56BC75E2D63100000');
    await impersonateAccount('0x000000000000000000000000000000000000dEaD');
    const snarkBypassSigner = await ethers.getSigner('0x000000000000000000000000000000000000dEaD');

    const [owner, bundler, user1, nonOwner] = await ethers.getSigners();

    const PoseidonT3 = await ethers.getContractFactory('PoseidonT3');
    const PoseidonT4 = await ethers.getContractFactory('PoseidonT4');
    const poseidonT3 = await PoseidonT3.deploy();
    const poseidonT4 = await PoseidonT4.deploy();

    const RailgunSmartWallet = await ethers.getContractFactory('RailgunSmartWallet', {
      libraries: {
        PoseidonT3: poseidonT3.address,
        PoseidonT4: poseidonT4.address,
      },
    });
    const railgun = await RailgunSmartWallet.deploy();

    await railgun.initializeRailgunLogic(owner.address, 0, 0, 0, owner.address);

    const railgunAdmin = railgun.connect(owner);

    await loadArtifacts(railgunAdmin, listArtifacts());
    await railgunAdmin.setBundler(bundler.address);

    const TestERC20 = await ethers.getContractFactory('TestERC20');
    const testERC20 = await TestERC20.deploy();
    const commodityERC20 = await TestERC20.deploy();
    const SimpleSwap = await ethers.getContractFactory('SimpleSwap');
    const simpleSwap = await SimpleSwap.deploy();

    await testERC20.mint(bundler.address, 2n ** 128n - 1n);
    await testERC20.mint(user1.address, 2n ** 128n - 1n);
    await commodityERC20.mint(simpleSwap.address, 2n ** 128n - 1n);
    await testERC20.connect(bundler).approve(railgun.address, 2n ** 256n - 1n);
    await testERC20.connect(user1).approve(railgun.address, 2n ** 256n - 1n);

    return {
      bundler,
      commodityERC20,
      nonOwner,
      owner,
      railgun,
      railgunAdmin,
      snarkBypassSigner,
      simpleSwap,
      testERC20,
      user1,
    };
  }

  async function buildShieldRequest(tokenAddress: string) {
    const tokenData: TokenData = {
      tokenType: TokenType.ERC20,
      tokenAddress,
      tokenSubID: 0n,
    };

    const shieldNote = new Note(
      randomBytes(32),
      randomBytes(32),
      10n ** 18n,
      randomBytes(16),
      tokenData,
      '',
    );

    return shieldNote.encryptForShield();
  }

  it('Should allow owner to set bundler', async () => {
    const { railgun, railgunAdmin, user1, nonOwner } = await loadFixture(deploy);

    await expect(railgunAdmin.setBundler(user1.address))
      .to.emit(railgun, 'BundlerChanged')
      .withArgs(user1.address);
    expect(await railgun.bundler()).to.equal(user1.address);

    await expect(railgun.connect(nonOwner).setBundler(nonOwner.address)).to.be.revertedWith(
      'Ownable: caller is not the owner',
    );
  });

  it('Should allow the bundler to shield', async () => {
    const { bundler, railgun, testERC20 } = await loadFixture(deploy);
    const shieldRequest = await buildShieldRequest(testERC20.address);

    await expect(railgun.connect(bundler).shield([shieldRequest])).to.not.be.reverted;
  });

  it('Should reject non-bundlers', async () => {
    const { railgun, testERC20, user1 } = await loadFixture(deploy);
    const shieldRequest = await buildShieldRequest(testERC20.address);

    await expect(railgun.connect(user1).shield([shieldRequest]))
      .to.be.revertedWithCustomError(railgun, 'InvalidBundler')
      .withArgs(user1.address);
  });

  it('Should allow the bundler to reshield plain ERC20 swap output', async () => {
    const { bundler, commodityERC20, railgun, simpleSwap, testERC20 } = await loadFixture(deploy);
    const shieldRequest = await buildShieldRequest(commodityERC20.address);
    const swapAmount = 10n ** 18n;

    await testERC20.connect(bundler).approve(simpleSwap.address, swapAmount);
    await simpleSwap.connect(bundler).swap(
      testERC20.address,
      commodityERC20.address,
      swapAmount,
      10000,
    );
    await commodityERC20.connect(bundler).approve(railgun.address, swapAmount);

    await expect(railgun.connect(bundler).shield([shieldRequest])).to.changeTokenBalances(
      commodityERC20,
      [bundler.address, railgun.address],
      [-swapAmount, swapAmount],
    );
  });

  it('Should allow EOAs to transact and block arbitrary contracts', async () => {
    const { railgun, snarkBypassSigner, user1 } = await loadFixture(deploy);

    await expect(railgun.connect(user1).transact([])).to.not.be.reverted;
    await expect(railgun.connect(snarkBypassSigner).transact([])).to.not.be.reverted;

    const RelayAdapt = await ethers.getContractFactory('RelayAdapt');
    const relayAdapt = await RelayAdapt.deploy(railgun.address, railgun.address);
    const actionData = {
      random: `0x${'00'.repeat(31)}`,
      requireSuccess: false,
      minGasLimit: 0,
      calls: [],
    };

    await expect(relayAdapt.relay([], actionData))
      .to.be.revertedWithCustomError(railgun, 'ContractCallerNotAllowed')
      .withArgs(relayAdapt.address);
  });
});
