import { expect } from 'chai';

import config from '../../hardhat.config';

describe('Config/Networks', () => {
  it('configures BNB mainnet deployment and verification', () => {
    const bnbNetwork = config.networks?.bnb;
    const etherscan = config.etherscan;

    // Keep deploy:no_governance and verify using the same Hardhat network name.
    expect(bnbNetwork).to.include({
      chainId: 56,
    });
    expect(etherscan?.apiKey).to.include({
      bnb: process.env.BSCSCAN_API_KEY ?? '',
    });
    expect(etherscan?.customChains).to.deep.include({
      network: 'bnb',
      chainId: 56,
      urls: {
        apiURL: 'https://api.bscscan.com/api',
        browserURL: 'https://bscscan.com',
      },
    });
  });
});
