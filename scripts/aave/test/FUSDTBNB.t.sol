// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import { Test } from "forge-std/Test.sol";
import { ImmutableATokenVault } from "AaveVault/ImmutableATokenVault.sol";
import { IPoolAddressesProvider } from "@aave-v3-core/interfaces/IPoolAddressesProvider.sol";
import { IERC20 } from "@openzeppelin/token/ERC20/IERC20.sol";

contract FUSDTBNBTest is Test {
  address constant TOKEN = 0x55d398326f99059fF775485246999027B3197955;
  address constant ATOKEN = 0xa9251ca9DE909CB71783723713B21E4233fbf1B1;
  address constant POOL = 0x6807dc923806fE8Fd134338EABCA509979a7e0cB;
  address constant PROVIDER = 0xff75B6da14FfbbfD355Daf7a2731456b3562Ba6D;
  address constant OWNER = 0xf57710Ec707CcE333DF85d2C12b42e17B6f8d8Fc;
  uint256 constant SEED = 1e18;
  uint256 constant FEE = 0.25e18;
  ImmutableATokenVault vault;

  function setUp() public {
    vm.createSelectFork(vm.envString("BNB_FORK_RPC_URL"), vm.envUint("BNB_FORK_BLOCK"));
    bytes memory args = abi.encode(
      TOKEN,
      uint16(0),
      IPoolAddressesProvider(PROVIDER),
      OWNER,
      FEE,
      "FUSDT",
      "FUSDT",
      SEED
    );
    address predicted = address(
      uint160(
        uint256(
          keccak256(
            abi.encodePacked(
              bytes1(0xff),
              address(this),
              bytes32(0),
              keccak256(abi.encodePacked(type(ImmutableATokenVault).creationCode, args))
            )
          )
        )
      )
    );
    deal(TOKEN, address(this), SEED);
    IERC20(TOKEN).approve(predicted, SEED);
    vault = new ImmutableATokenVault{ salt: bytes32(0) }(
      TOKEN,
      0,
      IPoolAddressesProvider(PROVIDER),
      OWNER,
      FEE,
      "FUSDT",
      "FUSDT",
      SEED
    );
    assertEq(address(vault), predicted);
  }

  function testConfigurationAndOwnerPermissions() public {
    assertEq(vault.asset(), TOKEN);
    assertEq(address(vault.ATOKEN()), ATOKEN);
    assertEq(address(vault.AAVE_POOL()), POOL);
    assertEq(vault.owner(), OWNER);
    assertEq(vault.getFee(), FEE);
    assertEq(vault.name(), "FUSDT");
    assertEq(vault.symbol(), "FUSDT");
    assertEq(vault.decimals(), 18);
    assertEq(vault.balanceOf(address(vault)), SEED);
    assertEq(vault.totalSupply(), SEED);
    assertGt(vault.maxDeposit(address(this)), SEED);
    vm.expectRevert("Ownable: caller is not the owner");
    vault.withdrawFees(address(this), 0);
    vm.expectRevert("Ownable: caller is not the owner");
    vault.setFee(0);
    vm.expectRevert("Initializable: contract is already initialized");
    vault.initialize(address(this), 0, "X", "X", 1);
  }

  function testDepositRedeemRoundTrip() public {
    address user = address(0x1234);
    uint256 amount = 10e18;
    deal(TOKEN, user, amount);
    vm.startPrank(user);
    IERC20(TOKEN).approve(address(vault), amount);
    uint256 shares = vault.deposit(amount, user);
    assertApproxEqAbs(shares, amount, amount / SEED + 2);
    uint256 assets = vault.redeem(shares, user, user);
    vm.stopPrank();
    assertApproxEqAbs(assets, amount, 1);
    assertApproxEqAbs(IERC20(TOKEN).balanceOf(user), amount, 1);
    assertEq(vault.balanceOf(user), 0);
    assertEq(vault.balanceOf(address(vault)), SEED);
  }

  function testQuarterOfYieldWithdrawnEntirelyToOwner() public {
    address user = address(0x1234);
    uint256 amount = 1000e18;
    deal(TOKEN, user, amount);
    vm.startPrank(user);
    IERC20(TOKEN).approve(address(vault), amount);
    vault.deposit(amount, user);
    vm.stopPrank();
    uint256 baseline = vault.getLastVaultBalance();
    skip(30 days);
    uint256 gross = IERC20(ATOKEN).balanceOf(address(vault));
    uint256 expectedFee = (gross - baseline) / 4;
    assertGt(expectedFee, 0);
    assertEq(vault.getClaimableFees(), expectedFee);
    assertEq(vault.totalAssets(), gross - expectedFee);
    uint256 ownerBefore = IERC20(ATOKEN).balanceOf(OWNER);
    vm.prank(OWNER);
    vault.withdrawFees(OWNER, expectedFee);
    assertApproxEqAbs(IERC20(ATOKEN).balanceOf(OWNER) - ownerBefore, expectedFee, 2);
    assertApproxEqAbs(IERC20(ATOKEN).balanceOf(address(vault)), gross - expectedFee, 2);
    assertEq(vault.getClaimableFees(), 0);
    uint256 shares = vault.balanceOf(user);
    vm.prank(user);
    uint256 assets = vault.redeem(shares, user, user);
    assertGt(assets, amount);
    assertEq(vault.balanceOf(user), 0);
  }
}
