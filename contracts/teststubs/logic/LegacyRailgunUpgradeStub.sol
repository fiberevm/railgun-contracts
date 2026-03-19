// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.7;
pragma abicoder v2;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/**
 * Minimal legacy implementation used to exercise upgrades from pre-whitelist deployments.
 */
contract LegacyRailgunUpgradeStub is Initializable, OwnableUpgradeable {
  function initializeRailgunLogic(
    address payable,
    uint120,
    uint120,
    uint256,
    address _owner
  ) external initializer {
    OwnableUpgradeable.__Ownable_init();
    OwnableUpgradeable.transferOwnership(_owner);
  }
}
