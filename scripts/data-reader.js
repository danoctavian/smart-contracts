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

function coversETHValue(covers, currencyRates) {
  let coversTotalSumAssuredByCurrency = {};
  let totalSumAssuredFromDB = 0;
  for (const cover of covers) {
    const { curr, sumAssured } = cover;
    if (!coversTotalSumAssuredByCurrency[curr]) {
      coversTotalSumAssuredByCurrency[curr] = 0;
    }

    coversTotalSumAssuredByCurrency[curr] += sumAssured;
    const baseCase = currencyRates[curr];
    const baseSAInETH = sumAssured * baseCase;
    totalSumAssuredFromDB += baseSAInETH;
  }

  return {
    totalSumAssuredFromDB,
    coversTotalSumAssuredByCurrency
  };
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

  const smartcoverdetails = db.collection('smartcoverdetails');

  const count = await smartcoverdetails.count();
  console.log({
    count
  });

  const allRelevantCovers = await smartcoverdetails.aggregate(
    [
      { $match: {
        version: 'M1',
        lockCN: { $ne: '0' },
        expirytimeStamp: { $gt: (new Date()).getTime() / 1000 },
        statusNum: { $ne: 3 },
      } }
    ]).toArray();



  const allCovers = await smartcoverdetails.find().toArray();

  console.log(`allCovers.length=${allCovers.length}`)
  const allIds = new Set(allCovers.map(c => c.coverId));
  for (let i = 1; i <= count; i++) {
    assert(allIds.has(i), `coverId: ${i} not present`);
  }

  const allAcceptedClaims = await smartcoverdetails.find({
    statusNum: 1
  }).toArray();

  console.log(allAcceptedClaims);

  client.close();

  const provider = new HDWalletProvider(privateKey, providerURL);
  const [address] = provider.getAddresses();
  console.log(`Using first address ${address} for sending transactions.`);


  const versionDataURL = 'https://api.nexusmutual.io/version-data/data.json';
  const nexusContractLoader = new NexusContractLoader(versionDataURL, new Web3(provider), {
    provider,
    defaultSender: address,
    defaultGas: 1e6, // 1 million
    defaultGasPrice: 5e9, // 5 gwei
  });
  await nexusContractLoader.init();

  console.log(`Loading master at ${MASTER_ADDRESS}..`);
  const mcr = nexusContractLoader.instance('MC');
  const qd = nexusContractLoader.instance('QD');
  const daiFeed = nexusContractLoader.instance('DAIFEED');

  const coverLength = await qd.getCoverLength();
  assert.equal(coverLength.toNumber() - 1, count);

  const currencyRates = {};

  const rate = await daiFeed.read();
  const usdRate = parseInt(rate, 16) / 1e18;
  currencyRates.DAI = 1 / usdRate;

  currencyRates.ETH = 1;

  let { totalSumAssuredFromDB, coversTotalSumAssuredByCurrency } = coversETHValue(allRelevantCovers, currencyRates);

  let { totalSumAssuredFromDB: totalClaimed } = coversETHValue(allAcceptedClaims, currencyRates);

  console.log({
    coversTotalSumAssuredByCurrency,
    totalSumAssuredFromDB,
    totalClaimed
  });

  const [totalSumAssuredETH, totalSumAssuredDAI, allSumAssurance ] =  await Promise.all([
    qd.getTotalSumAssured(hex('ETH')),
    qd.getTotalSumAssured(hex('DAI')),
    await mcr.getAllSumAssurance(),
  ]);

  console.log({
    totalSumAssuredETH: totalSumAssuredETH.toString(),
    totalSumAssuredDAI: totalSumAssuredDAI.toString(),
    allSumAssurance: allSumAssurance.toString()
  });

  console.log({
    totalDiff: totalSumAssuredFromDB - allSumAssurance.toNumber(),
    ethDiff: coversTotalSumAssuredByCurrency['ETH'] - totalSumAssuredETH.toNumber(),
    daiDiff: coversTotalSumAssuredByCurrency['DAI'] - totalSumAssuredDAI.toNumber()
  })
}

main()
  .catch(error => {
    console.error(`Unhandled app error: ${error.stack}`);
    process.exit(1);
  });
