import { expect } from 'chai';

import config from '../../hardhat.config';

describe('Config/Networks', () => {
  it('configures BNB mainnet deployment', () => {
    const bnbNetwork = config.networks?.bnb;

    expect(bnbNetwork).to.include({
      chainId: 56,
    });
  });

  it('configures Polygon PoS mainnet deployment', () => {
    expect(config.networks?.polygon).to.include({
      chainId: 137,
    });
  });

  it('uses the multichain Etherscan API V2 key', () => {
    expect(config.etherscan?.apiKey).to.equal(process.env.ETHERSCAN_API_KEY ?? '');
  });
});
