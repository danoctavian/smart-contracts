
import "@openzeppelin/contracts/ownership/Ownable.sol";
import "./interfaces/IPool1.sol";
import "./interfaces/INXMToken.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/INXMMaster.sol";

contract NexusMember is Ownable {

  INXMMaster nxMaster;

  constructor(address _nxMaster) public {
    nxMaster = INXMMaster(_nxMaster);
  }

  function nxmTokenApprove(address _spender, uint256 _value)
  public
  onlyOwner
  {
    IERC20 nxmToken = IERC20(nxMaster.tokenAddress());
    nxmToken.approve(_spender, _value);
  }

  function buyNXMTokens(uint ethAmount)
  public
  onlyOwner
  {
    address payable pool1Address = nxMaster.getLatestAddress("P1");
    IPool1 p1 = IPool1(pool1Address);

    INXMToken nxmToken = INXMToken(nxMaster.tokenAddress());
    p1.buyToken.value(ethAmount)();
  }

  function sellNXMTokens(uint amount)
  external
  onlyOwner
  returns (uint ethValue)
  {
    address payable pool1Address = nxMaster.getLatestAddress("P1");
    IPool1 p1 = IPool1(pool1Address);

    INXMToken nxmToken = INXMToken(nxMaster.tokenAddress());

    ethValue = p1.getWei(amount);
    nxmToken.approve(pool1Address, amount);
    p1.sellNXMTokens(amount);
  }

  function getEtherToBeReceived(uint amount)
  external
  view
  onlyOwner
  returns (uint ethValue)
  {
    address payable pool1Address = nxMaster.getLatestAddress("P1");
    IPool1 p1 = IPool1(pool1Address);
    INXMToken nxmToken = INXMToken(nxMaster.tokenAddress());
    ethValue = p1.getWei(amount);
  }

  function () payable external {
  }
}
