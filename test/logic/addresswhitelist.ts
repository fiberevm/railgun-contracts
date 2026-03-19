import { ethers } from 'hardhat';
import { expect } from 'chai';
import {
  loadFixture,
  setBalance,
  impersonateAccount,
  time,
} from '@nomicfoundation/hardhat-network-helpers';
import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import { loadArtifacts, listArtifacts } from '../../helpers/logic/artifacts';
import { randomBytes } from '../../helpers/global/crypto';
import { Note, TokenData, TokenType } from '../../helpers/logic/note';
import {
  getShieldAuthorizationScope,
  signShieldAuthorizationForRequests,
} from '../../helpers/logic/shieldAuthorization';

describe('Logic/ShieldAuthorization', () => {
  /**
   * Deploys a signature-authorized Railgun fixture for address access tests.
   * @returns Deployed contracts and test signers.
   */
  async function deploy() {
    await setBalance('0x000000000000000000000000000000000000dEaD', '0x56BC75E2D63100000');
    await impersonateAccount('0x000000000000000000000000000000000000dEaD');
    const snarkBypassSigner = await ethers.getSigner('0x000000000000000000000000000000000000dEaD');

    const [owner, bundler, trustedSigner, user1, nonOwner] = await ethers.getSigners();

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
    await railgunAdmin.setTrustedSigner(trustedSigner.address);

    const TestERC20 = await ethers.getContractFactory('TestERC20');
    const testERC20 = await TestERC20.deploy();
    await testERC20.mint(bundler.address, 2n ** 128n - 1n);
    await testERC20.mint(user1.address, 2n ** 128n - 1n);
    await testERC20.connect(bundler).approve(railgun.address, 2n ** 256n - 1n);
    await testERC20.connect(user1).approve(railgun.address, 2n ** 256n - 1n);

    const chainID = BigInt((await ethers.provider.send('eth_chainId', [])) as string);

    return {
      bundler,
      chainID,
      nonOwner,
      owner,
      railgun,
      railgunAdmin,
      snarkBypassSigner,
      testERC20,
      trustedSigner,
      user1,
    };
  }

  async function buildAuthorization(
    trustedSigner: SignerWithAddress,
    railgunAddress: string,
    chainID: bigint,
    shieldRequests: Awaited<ReturnType<Note['encryptForShield']>>[],
    nonce: bigint,
    expiry: bigint,
  ) {
    return signShieldAuthorizationForRequests(
      trustedSigner,
      railgunAddress,
      chainID,
      shieldRequests,
      nonce,
      expiry,
    );
  }

  it('Should allow owner to set bundler and trusted signer', async () => {
    const { railgun, railgunAdmin, user1, nonOwner } = await loadFixture(deploy);

    await expect(railgunAdmin.setBundler(user1.address))
      .to.emit(railgun, 'BundlerChanged')
      .withArgs(user1.address);
    expect(await railgun.bundler()).to.equal(user1.address);

    await expect(railgunAdmin.setTrustedSigner(user1.address))
      .to.emit(railgun, 'TrustedSignerChanged')
      .withArgs(user1.address);
    expect(await railgun.trustedSigner()).to.equal(user1.address);

    await expect(railgun.connect(nonOwner).setBundler(nonOwner.address)).to.be.revertedWith(
      'Ownable: caller is not the owner',
    );
    await expect(
      railgun.connect(nonOwner).setTrustedSigner(nonOwner.address),
    ).to.be.revertedWith('Ownable: caller is not the owner');
  });

  it('Should allow the bundler to shield with a valid signature', async () => {
    const { bundler, chainID, railgun, testERC20, trustedSigner } = await loadFixture(deploy);

    const tokenData: TokenData = {
      tokenType: TokenType.ERC20,
      tokenAddress: testERC20.address,
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
    const shieldRequest = await shieldNote.encryptForShield();
    const authorization = await buildAuthorization(
      trustedSigner,
      railgun.address,
      chainID,
      [shieldRequest],
      0n,
      (await time.latest()) + 3600,
    );

    await expect(railgun.connect(bundler).shield([shieldRequest], authorization)).to.not.be
      .reverted;

    expect(await railgun.nonces(getShieldAuthorizationScope([shieldRequest]))).to.equal(1);
  });

  it('Should reject non-bundlers even with a valid signature', async () => {
    const { chainID, railgun, testERC20, trustedSigner, user1 } = await loadFixture(deploy);

    const tokenData: TokenData = {
      tokenType: TokenType.ERC20,
      tokenAddress: testERC20.address,
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
    const shieldRequest = await shieldNote.encryptForShield();
    const authorization = await buildAuthorization(
      trustedSigner,
      railgun.address,
      chainID,
      [shieldRequest],
      0n,
      (await time.latest()) + 3600,
    );

    await expect(railgun.connect(user1).shield([shieldRequest], authorization))
      .to.be.revertedWithCustomError(railgun, 'InvalidBundler')
      .withArgs(user1.address);
  });

  it('Should reject signatures from untrusted signers', async () => {
    const { bundler, chainID, owner, railgun, testERC20 } = await loadFixture(deploy);

    const tokenData: TokenData = {
      tokenType: TokenType.ERC20,
      tokenAddress: testERC20.address,
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
    const shieldRequest = await shieldNote.encryptForShield();
    const authorization = await buildAuthorization(
      owner,
      railgun.address,
      chainID,
      [shieldRequest],
      0n,
      (await time.latest()) + 3600,
    );

    await expect(railgun.connect(bundler).shield([shieldRequest], authorization))
      .to.be.revertedWithCustomError(railgun, 'InvalidShieldAuthorization')
      .withArgs(owner.address);
  });

  it('Should reject replayed and expired shield signatures', async () => {
    const { bundler, chainID, railgun, testERC20, trustedSigner } = await loadFixture(deploy);

    const tokenData: TokenData = {
      tokenType: TokenType.ERC20,
      tokenAddress: testERC20.address,
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
    const shieldRequest = await shieldNote.encryptForShield();
    const scope = getShieldAuthorizationScope([shieldRequest]);
    const validAuthorization = await buildAuthorization(
      trustedSigner,
      railgun.address,
      chainID,
      [shieldRequest],
      0n,
      (await time.latest()) + 3600,
    );

    await expect(railgun.connect(bundler).shield([shieldRequest], validAuthorization)).to.not.be
      .reverted;

    await expect(railgun.connect(bundler).shield([shieldRequest], validAuthorization))
      .to.be.revertedWithCustomError(railgun, 'ShieldAuthorizationNonceMismatch')
      .withArgs(scope, 1, 0);

    const expiredAuthorization = await buildAuthorization(
      trustedSigner,
      railgun.address,
      chainID,
      [shieldRequest],
      1n,
      1n,
    );

    await expect(railgun.connect(bundler).shield([shieldRequest], expiredAuthorization))
      .to.be.revertedWithCustomError(railgun, 'ShieldAuthorizationExpired')
      .withArgs(1);
  });

  it('Should allow EOAs to transact without shield signatures and still block contract callers', async () => {
    const { railgun, snarkBypassSigner, user1 } = await loadFixture(deploy);

    await expect(railgun.connect(user1).transact([])).to.not.be.reverted;
    await expect(railgun.connect(snarkBypassSigner).transact([])).to.not.be.reverted;

    const RelayAdapt = await ethers.getContractFactory('RelayAdapt');
    const relayAdapt = await RelayAdapt.deploy(railgun.address, railgun.address);

    await expect(
      relayAdapt.relay([], {
        random: `0x${'00'.repeat(31)}`,
        requireSuccess: false,
        minGasLimit: 0,
        calls: [],
      }),
    )
      .to.be.revertedWithCustomError(railgun, 'ContractCallerNotAllowed')
      .withArgs(relayAdapt.address);
  });
});
