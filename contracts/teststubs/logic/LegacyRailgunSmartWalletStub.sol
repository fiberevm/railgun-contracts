// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.7;
pragma abicoder v2;

import {
  CommitmentPreimage,
  CommitmentCiphertext,
  ShieldCiphertext,
  UnshieldType,
  Transaction,
  ShieldRequest
} from "../../logic/Globals.sol";
import { Commitments } from "../../logic/Commitments.sol";
import { RailgunLogic } from "../../logic/RailgunLogic.sol";

/**
 * Legacy adapter test stub that preserves contract-callable transact behavior.
 */
contract LegacyRailgunSmartWalletStub is RailgunLogic {
  function shield(ShieldRequest[] calldata _shieldRequests) external {
    if (msg.sender != bundler) revert InvalidBundler(msg.sender);

    bytes32[] memory insertionLeaves = new bytes32[](_shieldRequests.length);
    CommitmentPreimage[] memory commitments = new CommitmentPreimage[](_shieldRequests.length);
    ShieldCiphertext[] memory shieldCiphertext = new ShieldCiphertext[](_shieldRequests.length);
    uint256[] memory fees = new uint256[](_shieldRequests.length);

    for (uint256 notesIter = 0; notesIter < _shieldRequests.length; notesIter += 1) {
      (bool valid, string memory reason) = RailgunLogic.validateCommitmentPreimage(
        _shieldRequests[notesIter].preimage
      );
      require(valid, reason);

      (commitments[notesIter], fees[notesIter]) = RailgunLogic.transferTokenIn(
        _shieldRequests[notesIter].preimage
      );

      insertionLeaves[notesIter] = RailgunLogic.hashCommitment(commitments[notesIter]);
      shieldCiphertext[notesIter] = _shieldRequests[notesIter].ciphertext;
    }

    (
      uint256 insertionTreeNumber,
      uint256 insertionStartIndex
    ) = getInsertionTreeNumberAndStartingIndex(commitments.length);

    emit Shield(insertionTreeNumber, insertionStartIndex, commitments, shieldCiphertext, fees);

    Commitments.insertLeaves(insertionLeaves);
    RailgunLogic.lastEventBlock = block.number;
  }

  function transact(Transaction[] calldata _transactions) external {
    uint256 commitmentsCount = RailgunLogic.sumCommitments(_transactions);

    bytes32[] memory commitments = new bytes32[](commitmentsCount);
    uint256 commitmentsStartOffset = 0;
    CommitmentCiphertext[] memory ciphertext = new CommitmentCiphertext[](commitmentsCount);

    for (uint256 transactionIter = 0; transactionIter < _transactions.length; transactionIter += 1) {
      (bool valid, string memory reason) = RailgunLogic.validateTransaction(
        _transactions[transactionIter]
      );
      require(valid, reason);

      commitmentsStartOffset = RailgunLogic.accumulateAndNullifyTransaction(
        _transactions[transactionIter],
        commitments,
        commitmentsStartOffset,
        ciphertext
      );
    }

    for (uint256 transactionIter = 0; transactionIter < _transactions.length; transactionIter += 1) {
      if (_transactions[transactionIter].boundParams.unshield != UnshieldType.NONE) {
        (bool valid, string memory reason) = RailgunLogic.validateCommitmentPreimage(
          _transactions[transactionIter].unshieldPreimage
        );
        require(valid, reason);

        RailgunLogic.transferTokenOut(_transactions[transactionIter].unshieldPreimage);
      }
    }

    (
      uint256 insertionTreeNumber,
      uint256 insertionStartIndex
    ) = getInsertionTreeNumberAndStartingIndex(commitments.length);

    if (commitments.length > 0) {
      emit Transact(insertionTreeNumber, insertionStartIndex, commitments, ciphertext);
    }

    Commitments.insertLeaves(commitments);
    RailgunLogic.lastEventBlock = block.number;
  }
}
