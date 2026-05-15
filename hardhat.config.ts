import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-chai-matchers';
import '@nomiclabs/hardhat-ethers';
import '@nomicfoundation/hardhat-verify';
import '@typechain/hardhat';
import 'hardhat-contract-sizer';
import 'hardhat-gas-reporter';
import 'solidity-coverage';
import 'hardhat-local-networks-config-plugin';

import './tasks';

import mocharc from './.mocharc.json';
import * as dotenv from 'dotenv';
dotenv.config();

const config: HardhatUserConfig = {
  defaultNetwork: 'hardhat',
  networks: {
    mainnet: {
      url:
        process.env.ETH_RPC_URL ??
        process.env.RPC_URL ??
        `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY ?? ''}`,
      accounts: process.env.PRIVATE_KEY ? [`0x${process.env.PRIVATE_KEY.replace(/^0x/, '')}`] : [],
      chainId: 1,
    },
    sepolia: {
      url:
        process.env.SEPOLIA_RPC_URL ??
        `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY ?? ''}`,
      accounts: process.env.PRIVATE_KEY ? [`0x${process.env.PRIVATE_KEY.replace(/^0x/, '')}`] : [],
      chainId: 11155111,
    },
    base: {
      url:
        process.env.BASE_RPC_URL ??
        `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY ?? ''}`,
      accounts: process.env.PRIVATE_KEY ? [`0x${process.env.PRIVATE_KEY.replace(/^0x/, '')}`] : [],
      chainId: 8453,
    },
    baseSepolia: {
      url:
        process.env.BASE_SEPOLIA_RPC_URL ??
        `https://base-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY ?? ''}`,
      accounts: process.env.PRIVATE_KEY ? [`0x${process.env.PRIVATE_KEY.replace(/^0x/, '')}`] : [],
      chainId: 84532,
    },
  },
  solidity: {
    compilers: [
      {
        version: '0.8.17',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          // Enable in future if contract size is an issue
          // Not enabling now because hardhat stack traces and
          // coverage reporting don't yet support it
          // viaIR: true,
          outputSelection: {
            '*': {
              '*': ['storageLayout'],
            },
          },
        },
      },
    ],
    overrides: {
      // Enable this to turn of viaIR for proxy contract
      // 'contracts/proxy/Proxy.sol': {
      //   version: '0.8.17',
      //   settings: {
      //     viaIR: false,
      //   },
      // },
    },
  },
  mocha: mocharc,
  gasReporter: {
    enabled: true,
    currency: 'USD',
  },
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY ?? '',
      sepolia: process.env.ETHERSCAN_API_KEY ?? '',
      base: process.env.BASESCAN_API_KEY ?? '',
      baseSepolia: process.env.BASESCAN_API_KEY ?? '',
    },
    customChains: [
      {
        network: 'base',
        chainId: 8453,
        urls: {
          apiURL: 'https://api.basescan.org/api',
          browserURL: 'https://basescan.org',
        },
      },
      {
        network: 'baseSepolia',
        chainId: 84532,
        urls: {
          apiURL: 'https://api-sepolia.basescan.org/api',
          browserURL: 'https://sepolia.basescan.org',
        },
      },
    ],
  },
};

export default config;
