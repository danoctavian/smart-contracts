const fetch = require('node-fetch');
const { setupLoader } = require('@openzeppelin/contract-loader');

const chains = {
  1: 'mainnet',
  42: 'kovan',
};

class NexusContractLoader {

  /**
   * @param versionDataURL {string} Address to load abis and addresses from
   * @param provider {Web3} Web3 instance
   * @param loaderOptions {Object} additional parameters to pass to the contract loader
   */
  constructor (versionDataURL, provider, loaderOptions) {
    this.versionDataURL = versionDataURL;
    this.provider = provider;
    this.loaderOptions = loaderOptions;
  }

  async init () {

    const { provider, loaderOptions } = this;
    const chainId = await provider.eth.net.getId();
    const chainName = chains[chainId] || false;

    if (chainName === false) {
      throw new Error(`Unknown chainId ${chainId}`);
    }

    console.log(`Fetching version data from ${this.versionDataURL} for chain ${chainName}`);
    const { [chainName]: data } = await fetch(this.versionDataURL).then(r => r.json());

    if (typeof data === 'undefined') {
      throw new Error(`No data for ${chainName} chain found.`);
    }

    this.data = data.abis
      .map(abi => ({ ...abi, contractAbi: JSON.parse(abi.contractAbi) }))
      .reduce((data, abi) => ({ ...data, [abi.code]: abi }), {});

    this.loader = setupLoader({ provider, ...loaderOptions }).truffle;
  }

  address (code) {
    return this.data[code].address;
  }

  instance (code) {
    const { contractAbi, address } = this.data[code];
    return this.loader.fromABI(contractAbi, null, address);
  }

  instancefromABI(contractAbi, address) {
    return this.loader.fromABI(contractAbi, null, address);
  }
}

module.exports = NexusContractLoader;
