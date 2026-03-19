import { BigNumberish, Signer, utils, constants } from 'ethers';

import type { ShieldRequest } from './note';
import { arrayToHexString } from '../global/bytes';

export const EMPTY_SHIELD_AUTHORIZATION_SCOPE = constants.HashZero;

const SHIELD_AUTHORIZATION_TYPES = {
  ShieldAuthorization: [
    { name: 'scope', type: 'bytes32' },
    { name: 'nonce', type: 'uint256' },
    { name: 'expiry', type: 'uint256' },
  ],
};

/**
 * Resolves the authorization scope for a shield batch.
 * @param shieldRequests - Shield requests in the batch.
 * @returns Batch scope as a hex string.
 */
export function getShieldAuthorizationScope(shieldRequests: ShieldRequest[]): string {
  return shieldRequests.reduce(
    (scope, shieldRequest) =>
      utils.keccak256(
        utils.solidityPack(
          ['bytes32', 'bytes32'],
          [scope, arrayToHexString(shieldRequest.preimage.npk, true)],
        ),
      ),
    EMPTY_SHIELD_AUTHORIZATION_SCOPE,
  );
}

/**
 * Signs a shield authorization and ABI-encodes it for contract calls.
 * @param signer - Trusted signer for the authorization.
 * @param verifyingContract - Railgun contract address.
 * @param chainId - Chain ID for the EIP-712 domain.
 * @param scope - Authorization scope for the shield batch.
 * @param nonce - Expected nonce for the scope.
 * @param expiry - Authorization expiry timestamp.
 * @returns ABI-encoded authorization bytes.
 */
export async function signShieldAuthorization(
  signer: Signer,
  verifyingContract: string,
  chainId: BigNumberish,
  scope: string,
  nonce: BigNumberish,
  expiry: BigNumberish,
): Promise<string> {
  const signature = await signer._signTypedData(
    {
      name: 'RAILGUN',
      version: '1',
      chainId: Number(chainId),
      verifyingContract,
    },
    SHIELD_AUTHORIZATION_TYPES,
    {
      scope,
      nonce,
      expiry,
    },
  );
  const split = utils.splitSignature(signature);

  return utils.solidityPack(
    ['uint256', 'uint256', 'bytes32', 'bytes32', 'uint8'],
    [nonce, expiry, split.r, split.s, split.v],
  );
}

/**
 * Resolves the authorization scope from the requests and signs an authorization.
 * @param signer - Trusted signer for the authorization.
 * @param verifyingContract - Railgun contract address.
 * @param chainId - Chain ID for the EIP-712 domain.
 * @param shieldRequests - Shield requests in the batch.
 * @param nonce - Expected nonce for the scope.
 * @param expiry - Authorization expiry timestamp.
 * @returns ABI-encoded authorization bytes.
 */
export async function signShieldAuthorizationForRequests(
  signer: Signer,
  verifyingContract: string,
  chainId: BigNumberish,
  shieldRequests: ShieldRequest[],
  nonce: BigNumberish,
  expiry: BigNumberish,
): Promise<string> {
  return signShieldAuthorization(
    signer,
    verifyingContract,
    chainId,
    getShieldAuthorizationScope(shieldRequests),
    nonce,
    expiry,
  );
}
