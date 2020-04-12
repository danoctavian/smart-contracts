const truffleContract = require('truffle-contract');

module.exports.deployCompiledContract = async (
  account,
  contractJson,
  arguments
) => {
  if (!account) {
    throw Error('No account supplied as a parameter');
  }

  const web3Contract = new web3.eth.Contract(contractJson.abi);
  web3Contract.options.data = contractJson.bytecode;

  const receipt = await web3.eth.sendTransaction({
    data: web3Contract
      .deploy({
        arguments: arguments
      })
      .encodeABI(),
    from: account,
    gas: 20000000
  });

  const contract = truffleContract({abi: contractJson.abi});
  contract.setProvider(web3.currentProvider);
  contract.defaults({
    from: account,
    gas: 3500000,
    gasPrice: 10000000000
  });
  return await contract.at(receipt.contractAddress);
};

module.exports.linkLibrary = (contractJson, libraryName, libraryAddress) => {
  // TODO: this probably doesn't work for larger names correctly (truncated)

  const placeholder = `__${libraryName}${'_'.repeat(38 - libraryName.length)}`;
  contractJson.bytecode = contractJson.bytecode
    .split(placeholder)
    .join(libraryAddress.slice(2));
};
