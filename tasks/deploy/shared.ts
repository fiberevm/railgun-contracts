interface ShieldAuthorizationConfig {
  bundler: string;
  trustedSigner: string;
}

export const VERIFICATION_BYPASS_ADDRESS = '0x000000000000000000000000000000000000dEaD';

type AddressNormalizer = (address: string) => string;

interface ShieldAuthorizationInputs {
  bundlerParam?: string;
  defaultBundler: string;
  defaultTrustedSigner: string;
  getAddress: AddressNormalizer;
  trustedSignerParam?: string;
}

interface RailgunAuthorizationAdmin {
  setBundler(bundler: string): Promise<{ wait(): Promise<unknown> }>;
  setTrustedSigner(signer: string): Promise<{ wait(): Promise<unknown> }>;
}

/**
 * Resolves the trusted signer and bundler for deployment tasks.
 * @param inputs - Raw task parameters and fallback addresses.
 * @returns Normalized shield authorization config.
 */
export function resolveShieldAuthorizationConfig(
  inputs: ShieldAuthorizationInputs,
): ShieldAuthorizationConfig {
  return {
    bundler: inputs.getAddress(inputs.bundlerParam ?? inputs.defaultBundler),
    trustedSigner: inputs.getAddress(inputs.trustedSignerParam ?? inputs.defaultTrustedSigner),
  };
}

/**
 * Configures shield authorization on a freshly deployed wallet.
 * @param railgun - Railgun contract with shield authorization admin methods.
 * @param config - Bundler and trusted signer configuration.
 * @returns Promise that resolves once the configuration is complete.
 */
export async function configureShieldAuthorization(
  railgun: RailgunAuthorizationAdmin,
  config: ShieldAuthorizationConfig,
): Promise<void> {
  console.log(`Setting trusted signer to ${config.trustedSigner}`);
  await (await railgun.setTrustedSigner(config.trustedSigner)).wait();

  console.log(`Setting bundler to ${config.bundler}`);
  await (await railgun.setBundler(config.bundler)).wait();
}
