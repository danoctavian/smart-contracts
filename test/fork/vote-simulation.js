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
const ClaimsData = contract.fromArtifact('ClaimsData');
const Claims = contract.fromArtifact('Claims');

const upgradeProxyImplementationCategoryId = 5;
const newContractAddressUpgradeCategoryId = 29;
const addNewInternalContractCategoryId = 34;



describe.only('simulation for voting', function () {

  this.timeout(0);


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
    const cd = await ClaimsData.at(nameToAddressMap['CD']);
    const cl = await Claims.at(nameToAddressMap['CL']);

    const [funder] = accounts;
    console.log({ funder });
    const { memberArray: boardMembers } = await mr.members('1');
    const secondBoardMember = boardMembers[1];
    console.log(`secondBoardMember ${secondBoardMember}`);
    for (const member of boardMembers) {
      console.log(`Topping up ${member}`);
      await web3.eth.sendTransaction({ from: funder, to: member, value: ether('1000000') });
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
    this.cd = cd;
    this.mcr = mcr;
    this.cl = cl;
    this.master = master;
    this.secondBoardMember = secondBoardMember;
  });

  it.only('lets claim expire', async function () {
    const { master, cd, secondBoardMember, cl, owner, boardMembers } = this;
    const week = 604800;
    const advance = week;
    console.log(`Advancing time by ${advance}`);

    const claimIds = [32, 33, 34];
    const claimId = 34;

    await time.increase(6 * 60 * 60);


    await time.increase(advance);

    await master.closeClaim(claimId);

    let status;
    status = await cd.getClaimStatusNumber(claimId);
    console.log({
      status,
      claimId: claimId.toString(),
      statusNo: status.statno.toString()
    });


    await master.closeClaim(claimId);


    status = await cd.getClaimStatusNumber(claimId);
    console.log({
      status,
      claimId: claimId.toString(),
      statusNo: status.statno.toString()
    });


    await master.closeClaim(claimId);


    status = await cd.getClaimStatusNumber(claimId);
    console.log({
      status,
      claimId: claimId.toString(),
      statusNo: status.statno.toString()
    });
    // await cl.submitCAVote(claimId, -1, {
    //   from: owner
    // });


    // for (const claimId of claimIds) {
    //   await master.closeClaim(claimId);
    //
    //   const status = await cd.getClaimStatusNumber(claimId);
    //   console.log({
    //     status,
    //     claimId: claimId.toString(),
    //     statusNo: status.statno.toString()
    //   });
    // }
  });
});
