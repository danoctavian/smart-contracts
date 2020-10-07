require('dotenv').config();
const HDWalletProvider = require('@truffle/hdwallet-provider');
const { setupLoader } = require('@openzeppelin/contract-loader');
const NexusContractLoader = require('./nexus-contract-loader');
const Web3 = require('web3');
const axios = require('axios');

const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');

const hex = string => '0x' + Buffer.from(string).toString('hex');
const MASTER_ADDRESS = '0x01bfd82675dbcc7762c84019ca518e701c0cd07e';


function getenv (key, fallback = false) {

  const value = process.env[key] || fallback;

  if (!value) {
    throw new Error(`Missing env var: ${key}`);
  }

  return value;
}


async function main() {
  const providerURL = getenv(`MAINNET_PROVIDER_URL`);
  const privateKey = getenv(`MAINNET_MNEMONIC`);

  // Connection URL
  const url = 'mongodb://localhost:27017';

  // Database Name
  const dbName = 'nexusmutual_db';

  // Use connect method to connect to the server
  const client = await MongoClient.connect(url);
  const db = client.db(dbName);

  const nftcovers = db.collection('nftcovers');
  const covers = await nftcovers.find().toArray();

  await analyze(covers);
  return;

  const provider = new HDWalletProvider(privateKey, providerURL);
  const [address] = provider.getAddresses();
  console.log(`Using first address ${address} for sending transactions.`);


  const versionDataURL = 'https://api.nexusmutual.io/version-data/data.json';


  const web3 = new Web3(provider);
  const loaderOptions = {
    provider,
    defaultSender: address,
    defaultGas: 1e6, // 1 million
    defaultGasPrice: 5e9, // 5 gwei
  }

  const loader = setupLoader({ web3, ...loaderOptions }).truffle;

  const nftAbi = require('./nft-abi');

  const nftAddress = '0x181aea6936b407514ebfc0754a37704eb8d98f91';
  const nft = loader.fromABI(nftAbi, null, nftAddress);

  const master = await nft.nxMaster();
  console.log({
    master: master
  })

  const zero = '0x0000000000000000000000000000000000000000';
  const mints = await nft.getPastEvents('Transfer', {
    fromBlock: 0,
    filter: {
      from: zero
    }
  });

  const batchSize = 30;
  for (let i = 200; i < mints.length; i += batchSize) {
    const batch = [];
    for (let j = i; j < Math.min(batchSize + i, mints.length); j++) {
      batch.push(j);
    }
    const tokens = await Promise.all(batch.map(async tokenId =>{
      const token = await nft.tokens(tokenId);
      token.tokenId = tokenId;
      return token;
    }));
    console.log(`Fetched ${tokens.length}`);

    for (let token of tokens) {
      try {
        await nftcovers.insert({
          tokenId: i,
          coverId: token.coverId.toString(),
          coverPrice: token.coverPrice.toString(),
          coverPriceNXM: token.coverPriceNXM.toString(),
          expirationTimestamp: token.expirationTimestamp.toString(),
          expireTime: token.expireTime.toString(),
          generationTime: token.generationTime.toString(),
          claimId: token.claimId.toString(),
          claimInProgress: token.claimInProgress,
          coverAmount: token.coverAmount.toString(),
          coverCurrency: token.coverCurrency,
        });
      } catch (e) {
        console.error(e.stack);
      }
    }
  }
  console.log('Done');
}

function valueAt(covers, timestamp) {
  covers = covers.map(c =>{
    return {...c, expirationTimestamp: parseInt(c.expirationTimestamp)}
  });

  const lockTokenTime = 3024000;

  const notExpired = covers.filter(c => c.expirationTimestamp - lockTokenTime >= timestamp);
  const totalSumAssured = {};

  for (const cover of notExpired) {
    const c = cover.coverCurrency.startsWith(hex('ETH')) ? 'ETH' : 'DAI';
    if (!totalSumAssured[c]) {
      totalSumAssured[c] = 0;
    }
    totalSumAssured[c] += parseInt(cover.coverAmount);
  }

  return totalSumAssured;
}

async function analyze(covers) {
  const now = new Date().getTime() / 1000;
  const month = 30 * 24 * 60 * 60;

  for (let i = 0; i < 12; i++) {
    console.log(`Value at month ${i}`);
    const value = valueAt(covers, now + i * month);
    console.log(value);
  }

}

main()
  .catch(error => {
    console.error(`Unhandled app error: ${error.stack}`);
    process.exit(1);
  });

