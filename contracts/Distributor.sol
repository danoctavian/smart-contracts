pragma solidity 0.5.7;
pragma experimental ABIEncoderV2;

import * as ERC721 from "@openzeppelin/contracts/token/ERC721/ERC721Full.sol";
import * as ERC721Enumerable from "@openzeppelin/contracts/token/ERC721/ERC721Enumerable.sol";
import * as IERC20 from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import * as Ownable from "@openzeppelin/contracts/ownership/Ownable.sol";
import * as ReentrancyGuard from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import * as SafeMath from "./external/openzeppelin-solidity/math/SafeMath.sol";
import * as INXMMaster from "./INXMMaster.sol";
import * as Pool1 from "./Pool1.sol";
import * as PoolData from "./PoolData.sol";
import * as TokenDataContract from "./TokenData.sol";
import * as Claims from "./Claims.sol";
import * as ClaimsData from "./ClaimsData.sol";
import * as NXMToken from "./NXMToken.sol";
import * as QuotationData from "./QuotationData.sol";

contract Distributor is
  ERC721.ERC721Full("NXMDistributorNFT", "NXMDNFT"),
  Ownable.Ownable,
  ReentrancyGuard.ReentrancyGuard {

  struct TokenData {
    uint expirationTimestamp;
    bytes4 coverCurrency;
    uint[] coverDetails;
    uint coverId;
    bool claimInProgress;
    uint claimId;
  }

  event PayoutReceived (
    address sender,
    uint value,
    bytes4 currency
  );

  event ClaimRedeemed (
    address receiver,
    uint value,
    bytes4 currency
  );


  INXMMaster.INXMMaster internal nxMaster;
  uint public priceLoadPercentage;
  uint256 internal tokenIdCounter;
  mapping(uint256 => TokenData) internal allTokenData;

  uint public withdrawableETH;
  mapping(bytes4 => uint) withdrawableTokens;

  constructor(address _masterAddress, uint _priceLoadPercentage) public {
    nxMaster = INXMMaster.INXMMaster(_masterAddress);
    priceLoadPercentage = _priceLoadPercentage;
  }

  function buyCover(
        address coveredContractAddress,
        bytes4 coverCurrency,
        uint[] memory coverDetails,
        uint16 coverPeriod,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
  )
     public
     payable
  {
    uint requiredValue = priceLoadPercentage.mul(coverDetails[1]).div(100).add(coverDetails[1]);

    if (coverCurrency == "ETH") {
      require(msg.value == requiredValue, "Incorrect value sent");

      Pool1.Pool1 p1 = Pool1.Pool1(nxMaster.getLatestAddress("P1"));
      p1.makeCoverBegin.value(coverDetails[1])(coveredContractAddress, coverCurrency, coverDetails, coverPeriod, _v, _r, _s);

      // add fee to the withdrawable pool
      withdrawableETH = withdrawableETH.add(requiredValue.sub(coverDetails[1]));
    } else {
      PoolData.PoolData pd = PoolData.PoolData(nxMaster.getLatestAddress("PD"));
      IERC20.IERC20 erc20 = IERC20.IERC20(pd.getCurrencyAssetAddress(coverCurrency));
      require(erc20.transferFrom(msg.sender, address(this), requiredValue), "Transfer failed");

      address payable pool1Address = nxMaster.getLatestAddress("P1");
      Pool1.Pool1 p1 = Pool1.Pool1(pool1Address);
      erc20.approve(pool1Address, coverDetails[1]);
      p1.makeCoverUsingCA(coveredContractAddress, coverCurrency, coverDetails, coverPeriod, _v, _r, _s);

      // add fee to the withdrawable pool
      withdrawableTokens[coverCurrency] = withdrawableTokens[coverCurrency].add(requiredValue.sub(coverDetails[1]));
    }

    // mint token
    QuotationData.QuotationData quotationData = QuotationData.QuotationData(nxMaster.getLatestAddress("QD"));
    TokenDataContract.TokenData tokenData = TokenDataContract.TokenData(nxMaster.getLatestAddress("TD"));
    // *assumes* the newly created claim is appended at the end of the list covers
    uint coverId = quotationData.getCoverLength().sub(1);
    uint256 lockTokenTimeAfterCoverExpiry = tokenData.lockTokenTimeAfterCoverExp();

    uint256 nextTokenId = tokenIdCounter++;
    uint expirationTimestamp = block.timestamp + lockTokenTimeAfterCoverExpiry + coverPeriod * 1 days;
    allTokenData[nextTokenId] = TokenData(expirationTimestamp, coverCurrency, coverDetails, coverId, false, 0);
    _mint(msg.sender, nextTokenId);
  }

  function submitClaim(
    uint256 tokenId
  )
    public
    onlyTokenApprovedOrOwner(tokenId)
  {
    require(!allTokenData[tokenId].claimInProgress, "Claim already in progress");
    require(allTokenData[tokenId].expirationTimestamp > block.timestamp, "Token is expired");

    Claims.Claims claims = Claims.Claims(nxMaster.getLatestAddress("CL"));
    claims.submitClaim(allTokenData[tokenId].coverId);

    ClaimsData.ClaimsData claimsData = ClaimsData.ClaimsData(nxMaster.getLatestAddress("CD"));
    uint claimId = claimsData.actualClaimLength() - 1;
    allTokenData[tokenId].claimInProgress = true;
    allTokenData[tokenId].claimId = claimId;
  }


  function redeemClaim(
    uint256 tokenId
  )
    public
    onlyTokenApprovedOrOwner(tokenId)
    nonReentrant
  {
    require(allTokenData[tokenId].claimInProgress, "No claim is in progress");

    QuotationData.QuotationData quotationData = QuotationData.QuotationData(nxMaster.getLatestAddress("QD"));
    uint8 coverStatus;
    uint sumAssured;
    (, coverStatus, sumAssured, , ) = quotationData.getCoverDetailsByCoverID2(allTokenData[tokenId].coverId);

    if (coverStatus == uint8(QuotationData.QuotationData.CoverStatus.ClaimAccepted)) {
      Claims.Claims claims = Claims.Claims(nxMaster.getLatestAddress("CL"));
      uint256 status;
      (, status, , , ) = claims.getClaimbyIndex(allTokenData[tokenId].claimId);

      if (status == 14 || status == 7) {
        _burn(tokenId);
        _sendAssuredSum(allTokenData[tokenId].coverCurrency, sumAssured);
        emit ClaimRedeemed(msg.sender, sumAssured, allTokenData[tokenId].coverCurrency);
      } else {
        revert("Claim accepted but payout not completed");
      }
    } else {
      revert("Claim is not accepted");
    }
  }

  function _sendAssuredSum(
    bytes4 coverCurrency,
    uint sumAssured
    )
    internal
  {
    if (coverCurrency == "ETH") {
      msg.sender.transfer(sumAssured);
    } else {
      PoolData.PoolData pd = PoolData.PoolData(nxMaster.getLatestAddress("PD"));
      IERC20.IERC20 erc20 = IERC20.IERC20(pd.getCurrencyAssetAddress(coverCurrency));
      require(erc20.transfer(msg.sender, sumAssured), "Transfer failed");
    }
  }

  function getTokenData(uint tokenId) public view returns (TokenData memory) {
    return allTokenData[tokenId];
  }

  function nxmTokenApprove(address _spender, uint256 _value)
  public
  onlyOwner
  {
    NXMToken.NXMToken nxmToken = NXMToken.NXMToken(nxMaster.tokenAddress());
    nxmToken.approve(_spender, _value);
  }

  function withdrawETH(address payable _recipient, uint256 _amount)
    external
    onlyOwner
  {
    require(withdrawableETH >= _amount, "Not enough ETH");
    withdrawableETH = withdrawableETH.sub(_amount);
    _recipient.transfer(_amount);
  }

  function withdrawTokens(address payable _recipient, uint256 _amount, bytes4 _currency)
    external
    onlyOwner
  {
    require(withdrawableTokens[_currency] >= _amount, "Not enough tokens");
    withdrawableTokens[_currency] = withdrawableTokens[_currency].sub(_amount);

    PoolData.PoolData pd = PoolData.PoolData(nxMaster.getLatestAddress("PD"));
    IERC20.IERC20 erc20 = IERC20.IERC20(pd.getCurrencyAssetAddress(_currency));
    require(erc20.transfer(_recipient, _amount), "Transfer failed");
  }

  function sellNXMTokens(uint amount)
    external
    onlyOwner
  {
    address payable pool1Address = nxMaster.getLatestAddress("P1");
    Pool1.Pool1 p1 = Pool1.Pool1(pool1Address);

    NXMToken.NXMToken nxmToken = NXMToken.NXMToken(nxMaster.tokenAddress());

    uint ethValue = p1.getWei(amount);
    nxmToken.approve(pool1Address, amount);
    p1.sellNXMTokens(amount);

    withdrawableETH = withdrawableETH.add(ethValue);
  }

  modifier onlyTokenApprovedOrOwner(uint256 tokenId) {
    require(_isApprovedOrOwner(msg.sender, tokenId), "Not approved or owner");
    _;
  }

  function () payable external {
    emit PayoutReceived(msg.sender, msg.value, "ETH");
  }
}
