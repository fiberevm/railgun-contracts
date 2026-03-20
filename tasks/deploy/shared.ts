interface BundlerConfig {
  bundler: string;
}

export const VERIFICATION_BYPASS_ADDRESS = '0x000000000000000000000000000000000000dEaD';

type AddressNormalizer = (address: string) => string;

interface BundlerInputs {
  bundlerParam?: string;
  defaultBundler: string;
  getAddress: AddressNormalizer;
}

interface RailgunBundlerAdmin {
  setBundler(bundler: string): Promise<{ wait(): Promise<unknown> }>;
}

/**
 * Resolves the bundler for deployment tasks.
 * @param inputs - Raw task parameters and fallback addresses.
 * @returns Normalized bundler config.
 */
export function resolveBundlerConfig(inputs: BundlerInputs): BundlerConfig {
  return {
    bundler: inputs.getAddress(inputs.bundlerParam ?? inputs.defaultBundler),
  };
}

/**
 * Configures the bundler on a freshly deployed wallet.
 * @param railgun - Railgun contract with bundler admin methods.
 * @param config - Bundler configuration.
 * @returns Promise that resolves once the configuration is complete.
 */
export async function configureBundler(
  railgun: RailgunBundlerAdmin,
  config: BundlerConfig,
): Promise<void> {
  console.log(`Setting bundler to ${config.bundler}`);
  await (await railgun.setBundler(config.bundler)).wait();
}
