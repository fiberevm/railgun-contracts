interface BundlerConfig {
  bundler: string;
}

interface BundlerInputs {
  bundlerParam?: string;
  defaultBundler: string;
  getAddress: (address: string) => string;
}

interface RailgunBundlerAdmin {
  setBundler(bundler: string): Promise<{ wait(): Promise<unknown> }>;
}

interface EthersFormatter {
  transactionResponse: (tx: Record<string, unknown>) => unknown;
  receipt: (receipt: Record<string, unknown>) => unknown;
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

/**
 * Patches the ethers v5 formatter to handle `to: ""` in RPC responses for
 * contract-creation transactions. Some providers (Alchemy, Infura) return
 * an empty string instead of null, which ethers v5 cannot parse.
 *
 * Patches both transactionResponse (used by getTransaction, getBlockWithTransactions)
 * and receipt (used by getTransactionReceipt / .wait()) formatters.
 */
export function patchProviderForContractCreation(provider: {
  formatter?: EthersFormatter;
}): void {
  const formatter = provider.formatter;
  if (!formatter) return;

  const origTxResponse = formatter.transactionResponse.bind(formatter);
  formatter.transactionResponse = (tx: Record<string, unknown>) => {
    if (tx.to === '') tx.to = null;
    return origTxResponse(tx);
  };

  const origReceipt = formatter.receipt.bind(formatter);
  formatter.receipt = (receipt: Record<string, unknown>) => {
    if (receipt.to === '') receipt.to = null;
    return origReceipt(receipt);
  };
}
