import path from 'node:path';
import config from '../../hardhat.config';

const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) throw new Error('Missing local deployment key');

export default {
  ...config,
  paths: { ...config.paths, root: path.resolve(__dirname, '../..') },
  networks: {
    ...config.networks,
    hardhat: {
      chainId: 56,
      hardfork: 'cancun',
      blockGasLimit: 70000000,
      initialBaseFeePerGas: 0,
      gasPrice: 50000000,
      ...(process.env.BNB_FORK_RPC_URL
        ? {
            forking: {
              enabled: true,
              url: process.env.BNB_FORK_RPC_URL,
              httpHeaders: {},
              ...(process.env.BNB_FORK_BLOCK
                ? { blockNumber: Number(process.env.BNB_FORK_BLOCK) }
                : {}),
            },
          }
        : {}),
      accounts: [{ privateKey, balance: '1000000000000000000' }],
    },
  },
};
