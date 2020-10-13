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


function chunk (arr, chunkSize) {
  const chunks = [];
  let i = 0;
  const n = arr.length;

  while (i < n) {
    chunks.push(arr.slice(i, i + chunkSize));
    i += chunkSize;
  }
  return chunks;
}


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

async function storeOnChainCovers(db, qd, specificIds, update) {
  const onchaincovers = db.collection('onchaincovers');

  console.log(`storing covers`);
  const lastIds =  await onchaincovers.find().sort({ coverId: -1 }).toArray();
  const lastId = lastIds[0] ? lastIds[0].coverId : 0;
  console.log(`lastId: ${lastId}`);
  const batchSize = 100;
  const startId = Math.max(lastId - batchSize, 0);

  async function fetch(coverId) {
    console.log(`Processing ${coverId}`);
    let cover;
    cover = await qd.getCoverDetailsByCoverID2(coverId);

    try {
      if (update) {
        console.log(`Updating status for ${coverId} to ${cover.status.toString()}`);
        await onchaincovers.update({ cid: coverId.toString() }, {
          coverId,
          status: cover.status.toString()
        });
        console.log(`Done updating ${coverId}`);
      } else {
        await onchaincovers.insert({
          coverId,
          cid: cover.cid.toString(),
          status: cover.status.toString(),
          sumAssured: cover.sumAssured.toString(),
          validUntil: cover.validUntil.toString(),
          coverPeriod: cover.coverPeriod.toString()
        });
      }
    } catch (e) {
      if (e.message.includes('duplicate key error collection')) {
        console.log(`Dupe coverId ${coverId} ${e.stack}`);
      } else {
        throw e;
      }
    }
  }

  if (specificIds) {
    console.log({
      specificIds
    });

    const batches = chunk(specificIds, batchSize);
    console.log(`Processing ${batches.length} batches.`);
    let batchIndex = 0;
    for (const batch of batches) {
      console.log(`Processing batch ${batchIndex++}`);
      await Promise.all(batch.map(fetch));
    }

    console.log('Done');
    return;
  }


  for (let i = startId; i < 2400; i += batchSize) {
    const batch = [];
    for (let j = i; j < batchSize + i; j++) {
      batch.push(j);
    }
    console.log(`Processing`);
    console.log(batch);
    try {
      await Promise.all(batch.map(fetch));
    } catch (e) {
      console.error(`Failed with ${e.stack}`);
    }
  }
  console.log(`Done`);
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
        expirytimeStamp: { $gte: (new Date()).getTime() / 1000 },
//        statusNum: { $ne: 3 },
      } }
    ]).toArray();


  // { $lt: ((Math.floor(new Date().getTime() / 1000)).toString()) }

  const onchaincovers = db.collection('onchaincovers');
  const onChainCovers = await onchaincovers.find().toArray();
  const allOnChainCoversIds = new Set(onChainCovers.map(c => c.coverId));
  console.log(`Check for missing ids..`);
  for (let i = 1; i <= count; i++) {
    const has = allOnChainCoversIds.has(i);
    if (!has) {
      console.error(`Missing id ${i}`);
    }
  }

  const allCovers = await smartcoverdetails.find().toArray();

  console.log(`allCovers.length=${allCovers.length}`)
  const allIds = new Set(allCovers.map(c => c.coverId));
  for (let i = 1; i <= count; i++) {
    assert(allIds.has(i), `coverId: ${i} not present`);
  }


  const allAcceptedClaimsIds = (await onchaincovers.find({
    status: '1'
  }).toArray()).map(c => c.coverId);

  const allAcceptedClaims = await smartcoverdetails.find({
    coverId: { $in: allAcceptedClaimsIds }
  }).toArray();

  console.log(allAcceptedClaims);

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
  const pool1 = nexusContractLoader.instance('P1');

  if (process.argv[2] === 'store') {
    await storeOnChainCovers(db, qd);
    return;
  }

  if (process.argv[2] === 'unexpired') {
    const possiblyUnexpired = await onchaincovers.find({
      status: { $ne: "3" },
      validUntil: { $lte: Math.floor((new Date()).getTime() / 1000).toString() }
    }).toArray();

    const coverIds = possiblyUnexpired.map(u => u.coverId);

    await storeOnChainCovers(db, qd, coverIds, true);
    return;
  }

  const pastPayoutEvents = await pool1.getPastEvents('Payout', {
    fromBlock: 0,
  });

  console.log(`Detected ${pastPayoutEvents.length} events`);
  // assert.equal(pastPayoutEvents.length, allAcceptedClaims.length);

  const coverLength = await qd.getCoverLength();
  assert.equal(coverLength.toNumber() - 1, count);

  const currencyRates = {};

  const rate = await daiFeed.read();
  const usdRate = parseInt(rate, 16) / 1e18;
  currencyRates.DAI = 1 / usdRate;

  currencyRates.ETH = 1;

  let { totalSumAssuredFromDB, coversTotalSumAssuredByCurrency } = coversETHValue(allRelevantCovers, currencyRates);


  const allRejectedClaimsIds = (await onchaincovers.find({
    status: '2'
  }).toArray()).map(c => c.coverId);

  const allRejectedClaims = await smartcoverdetails.find({
    coverId: { $in: allRejectedClaimsIds }
  }).toArray();

  const allSubmittedClaimsIds = (await onchaincovers.find({
    status: '4'
  }).toArray()).map(c => c.coverId);

  const allSubmittedClaims = await smartcoverdetails.find({
    coverId: { $in: allSubmittedClaimsIds }
  }).toArray();

  console.log({
    allRejectedClaimsLen: allRejectedClaims.length,
    allSubmittedClaimsLen: allSubmittedClaims.length
  });

  let { totalSumAssuredFromDB: totalClaimed } = coversETHValue(allAcceptedClaims, currencyRates);
  let { totalSumAssuredFromDB: totalRejectedClaim } = coversETHValue(allRejectedClaims, currencyRates);
  let { totalSumAssuredFromDB: totalSubmittedClaim } = coversETHValue(allSubmittedClaims, currencyRates);

  console.log({
    coversTotalSumAssuredByCurrency,
    totalSumAssuredFromDB,
    totalClaimed,
    totalRejectedClaim,
    totalSubmittedClaim
  });

  /*
  removeSAFromCSA
  _removeSAFromCSA
  subFromTotalSumAssured
   */

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

  client.close();
}

main()
  .catch(error => {
    console.error(`Unhandled app error: ${error.stack}`);
    process.exit(1);
  });
