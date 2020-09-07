/* Copyright (C) 2017 NexusMutual.io

  This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

  This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
    along with this program.  If not, see http://www.gnu.org/licenses/ */

pragma solidity ^0.5.17;

interface IPool1  {

  /**
   * @dev Iupgradable Interface to update dependent contract address
   */
  function changeDependentContractAddress() external;

  /// @dev Enables user to purchase cover with funding in ETH.
  /// @param smartCAdd Smart Contract Address
  function makeCoverBegin(
    address smartCAdd,
    bytes4 coverCurr,
    uint[] calldata coverDetails,
    uint16 coverPeriod,
    uint8 _v,
    bytes32 _r,
    bytes32 _s
  )
  external
  payable;

  /**
   * @dev Enables user to purchase cover via currency asset eg DAI
   */
  function makeCoverUsingCA(
    address smartCAdd,
    bytes4 coverCurr,
    uint[] calldata coverDetails,
    uint16 coverPeriod,
    uint8 _v,
    bytes32 _r,
    bytes32 _s
  )
  external;


  /**
   * @dev Returns the amount of wei a seller will get for selling NXM
   * @param amount Amount of NXM to sell
   * @return weiToPay Amount of wei the seller will get
   */
  function getWei(uint amount) external view returns(uint);

  /**
   * @dev Allows selling of NXM for ether.
   * Seller first needs to give this contract allowance to
   * transfer/burn tokens in the NXMToken contract
   * @param  _amount Amount of NXM to sell
   * @return success returns true on successfull sale
   */
  function sellNXMTokens(uint _amount) external  returns (bool);

  function buyToken() external payable returns(bool success);
}

