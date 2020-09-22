const axios = require('axios');
const { contract, accounts, web3 } = require('@openzeppelin/test-environment');
const { ether, expectRevert, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const BN = require('web3').utils.BN;
const Decimal = require('decimal.js');

const { encode1 } = require('./external');
const { logEvents, hex } = require('../utils/helpers');

const MemberRoles = contract.fromArtifact('MemberRoles');
const NXMaster = contract.fromArtifact('NXMaster');
const Pool1 = contract.fromArtifact('Pool1');
const MCR = contract.fromArtifact('MCR');
const NXMToken = contract.fromArtifact('NXMToken');
const Governance = contract.fromArtifact('Governance');
const PooledStaking = contract.fromArtifact('PooledStaking');
const TokenController = contract.fromArtifact('TokenController');
const PoolData = contract.fromArtifact('PoolData');
const UpgradeabilityProxy = contract.fromArtifact('UpgradeabilityProxy');
const NexusMember = contract.fromArtifact('NexusMember');

const upgradeProxyImplementationCategoryId = 5;
const newContractAddressUpgradeCategoryId = 29;
const addNewInternalContractCategoryId = 34;

async function submitGovernanceProposal (categoryId, actionHash, members, gv, submitter) {

  const proposalTitle = 'proposal';
  const proposalSD = 'proposal';
  const proposalDescHash = 'proposal';
  const incentive = 0;
  const proposalId = await gv.getProposalLength();
  console.log(`Creating proposal ${proposalId}`);

  await gv.createProposal(proposalTitle, proposalSD, proposalDescHash, 0, { from: submitter });
  await gv.categorizeProposal(proposalId, categoryId, incentive, { from: submitter });
  await gv.submitProposalWithSolution(proposalId, 'proposal', actionHash, { from: submitter });

  console.log(`Voting for proposal ${proposalId}`);

  for (let i = 0; i < members.length; i++) {
    await gv.submitVote(proposalId, 1, { from: members[i] });
  }

  console.log(`Closing proposal`);
  await time.increase(604800);
  logEvents(await gv.closeProposal(proposalId, { from: submitter }));

  const proposal = await gv.proposal(proposalId);
  assert.equal(proposal[2].toNumber(), 3);
}

function wad(weiBN) {
  const decimal = Decimal(weiBN.toString());
  return decimal.div('1e18').toFixed();
}

async function sell(amount, from, p1, mcr) {
  let leftToBeSold = amount;

  let i =0;
  while (leftToBeSold.gt(new BN('0'))) {
    console.log(`Selling Round ${i++}`);
    console.log(`leftToBeSold ${wad(leftToBeSold)}`);
    const maxSellTokens = await mcr.getMaxSellTokens();
    console.log(`maxSellTokens ${wad(maxSellTokens)}`);

    price = await mcr.calculateTokenPrice(hex('DAI'));
    console.log(`price before sale: ${wad(price)}`);
    const sellAmount = maxSellTokens.gt(leftToBeSold) ? leftToBeSold : maxSellTokens;
    const tx = await p1.sellNXMTokens(sellAmount, {
      from
    });
    console.log({ gasUsed: tx.receipt.gasUsed });

    leftToBeSold = leftToBeSold.sub(sellAmount);
    price = await mcr.calculateTokenPrice(hex('DAI'));
    console.log(`price after sale: ${wad(price)}`);
  }
}

async function buy(ethAmount, from, p1, mcr, tk) {
  let price = 0;
  price = await mcr.calculateTokenPrice(hex('DAI'));
  console.log(`price: ${wad(price)}`);

  console.log(`buy worth of ${wad(ethAmount)} ETH`);

  const balanceBefore =await tk.balanceOf(from);
  const tx = await p1.buyToken({
    from,
    value: ethAmount
  });
  const balanceAfter =await tk.balanceOf(from);

  const balanceDiff = balanceAfter.sub(balanceBefore);
  console.log(`token gained: ${wad(balanceDiff)}`);

  price = await mcr.calculateTokenPrice(hex('DAI'));
  console.log(`price: ${wad(price)}`);
  return balanceDiff;
}

async function postMCR() {
  /*
     0	mcrP	uint256	14170
    1	mcrE	uint256	75946309164276240000000
    2	vF	uint256	107614959829648270000000
    3	curr	bytes4[]	45544800 44414900
    4	_threeDayAvg	uint256[]	100 42962
    5	onlyDate	uint64	1597600800
   */

}

describe.only('price simulation', function () {

  this.timeout(0);


  const notarize = '0x176c27973e0229501d049de626d50918dda24656';

  before(async function () {
    const { data: versionData } = await axios.get('https://api.nexusmutual.io/version-data/data.json');
    const [{ address: masterAddress }] = versionData.mainnet.abis.filter(({ code }) => code === 'NXMASTER');

    const master = await NXMaster.at(masterAddress);
    const { contractsName, contractsAddress } = await master.getVersionData();

    const nameToAddressMap = {
      NXMTOKEN: await master.dAppToken()
    };

    for (let i = 0; i < contractsName.length; i++) {
      nameToAddressMap[web3.utils.toAscii(contractsName[i])] = contractsAddress[i];
    }

    const mr = await MemberRoles.at(nameToAddressMap['MR']);
    const tk = await NXMToken.at(nameToAddressMap['NXMTOKEN']);
    const gv = await Governance.at(nameToAddressMap['GV']);
    const p1 = await Pool1.at(nameToAddressMap['P1']);
    const mcr = await MCR.at(nameToAddressMap['MC']);
    const pd = await PoolData.at(nameToAddressMap['PD']);

    const [funder] = accounts;
    console.log({ funder });
    const { memberArray: boardMembers } = await mr.members('1');
    const secondBoardMember = boardMembers[1];
    console.log(`secondBoardMember ${secondBoardMember}`);
    const addressesToTopUp = [notarize];
    addressesToTopUp.push(...addressesToTopUp);
    for (const member of addressesToTopUp) {
      console.log(`Topping up ${member}`);
      await web3.eth.sendTransaction({ from: funder, to: member, value: ether('10000000000000') });
    }



    const { memberArray: [owner] } = await mr.members('3');
    console.log(owner);

    this.boardMembers = boardMembers;
    this.owner = owner;
    this.mr = mr;
    this.tk = tk;
    this.gv = gv;
    this.p1 = p1;
    this.pd = pd;
    this.mcr = mcr;
    this.master = master;
  });

  it('performs sells and buys', async function () {
    const { boardMembers, owner, tk, p1, mcr, master, mr } = this;
    const balance = await tk.balanceOf(owner);
    console.log(`balance: ${wad(balance)}`);
    const secondBoardMember = boardMembers[1];

    const nexusMemberContract = await NexusMember.new(master.address, {
      from: secondBoardMember
    });

    const fee = ether('0.002');

    await mr.payJoiningFee(nexusMemberContract.address, {
      from: owner,
      value: fee,
    });
    await mr.kycVerdict(nexusMemberContract.address, true, {
      from: notarize
    });

    await tk.transfer(nexusMemberContract.address, ether('2000'), {
      from: owner
    });

    const nxmBal = await tk.balanceOf(nexusMemberContract.address);
    console.log({ nxmBal: wad(nxmBal) });

    console.log(`Selling tokens with contract member ${nexusMemberContract.address}:`)

    const [funder] = accounts;
    await web3.eth.sendTransaction({ from: funder, to: nexusMemberContract.address, value: ether('1000000') });

    console.log(`Buying nxm tokens.`);
    const tx = await nexusMemberContract.buyNXMTokens(ether('17000'), {
      from: secondBoardMember
    });
    console.log({gasUsed: tx.receipt.gasUsed });

    const nxmBalPostBuy = await tk.balanceOf(nexusMemberContract.address);
    console.log({ nxmBalPostBuy: wad(nxmBalPostBuy) });

    console.log(`Approving tokens`);
    await nexusMemberContract.nxmTokenApprove(p1.address, ether('1'), {
      from: secondBoardMember
    });


    const toBeReceived = await nexusMemberContract.getEtherToBeReceived(ether('200'), {
      from: secondBoardMember
    });

    console.log({ toBeReceived: wad(toBeReceived) });

    console.log(`Selling directly:`);
    await sell(ether('100'), owner, p1, mcr);
    console.log(`Selling from member contract:`);
    await nexusMemberContract.sellNXMTokens(ether('1'), {
      from: secondBoardMember
    });

    const bal = await web3.eth.getBalance(nexusMemberContract.address);
    console.log({ bal: wad(bal) });
    return;

    // await sell(ether('8000'), owner, p1, mcr);

    // await buy(ether('2000'), owner, p1, mcr);
    for (let i = 0; i < 9; i++) {
      await buy(ether('15000'), secondBoardMember, p1, mcr, tk);
    }

    const tokensBought = await buy(ether('15000'), secondBoardMember, p1, mcr, tk);
    await sell(tokensBought, owner, p1, mcr);

    // await buy(ether('5000'), secondBoardMember, p1, mcr);
  });

  it('deploys new TokenController and mints for inflation', async function () {
    const { boardMembers, owner, tk, p1, mcr, gv, master, pd } = this;


    const notariseAddress =await pd.notariseMCR();
    console.log({ notariseAddress });
    console.log(`Deploying new contracts`);
    const newTC = await TokenController.new();

    const txData = encode1(
      ['bytes2[]', 'address[]'],
      [[hex('TC')], [newTC.address]],
    );

    console.log(`Proposal tx data: ${txData}`);

    await submitGovernanceProposal(
      upgradeProxyImplementationCategoryId,
      txData, boardMembers, gv, owner,
    );

    const tcProxy = await UpgradeabilityProxy.at(await master.getLatestAddress(hex('TC')));
    const storedNewTCAddress = await tcProxy.implementation();
    assert.equal(storedNewTCAddress, newTC.address);
    const tc = await TokenController.at(tcProxy.address);

    price = await mcr.calculateTokenPrice(hex('DAI'));
    console.log(`price: ${wad(price)}`);

    const mintAmount = ether('30000');

    const bal1 =await tk.balanceOf(owner);
    console.log(`bal1 ${wad(bal1)}`);
    await tc.mint(owner, mintAmount);
    const bal2 =await tk.balanceOf(owner);
    console.log(`bal2 ${wad(bal2)}`);

    price = await mcr.calculateTokenPrice(hex('DAI'));
    console.log(`price: ${wad(price)}`);
  });
});
