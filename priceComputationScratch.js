const Decimal = require('decimal.js');
const fs = require('fs');

const A = 0.01028
const C = 5800000

function getM1(m0, tokens, MCReth) {
  return m0 -   tokens * getPrice(m0, MCReth) / (2 * MCReth)
}

const getTokensForBuy = (Vt0, deltaETH, MCReth) => {
  Vt0 = Decimal(Vt0);
  deltaETH = Decimal(deltaETH);
  const Vt1 = Vt0.add(deltaETH);


  const MCRethDecimal = Decimal(MCReth);
  const CDecimal = Decimal(C);
  const M = Decimal(1).div(CDecimal.mul(MCRethDecimal.pow(3)));
  const a = Decimal(A);
  function integral(x) {
    /*
    (tanh^(-1)((sqrt(2) x (a m)^(1/4))/(sqrt(a) + sqrt(m) x^2)) - tan^(-1)(1 - sqrt(2) x (m/a)^(1/4)) + tan^(-1)(sqrt(2) x (m/a)^(1/4) + 1))/(2 sqrt(2) (a^3 m)^(1/4)) + constant
     */

    x = Decimal(x);
    const numeratorTerm1 =
      Decimal(2).sqrt()
        .mul(x)
        .mul((a.mul(M)).pow(1/4))
        .div((a.sqrt().add(M.sqrt().mul(x.pow(2)))))
        .atanh();

    const numeratorTerm2 =
      Decimal(1)
        .sub(Decimal(2).sqrt().mul(x).mul((M.div(a)).pow(1/4)))
        .atan()

    const numeratorTerm3 =
      Decimal(2).sqrt()
        .mul(x)
        .mul((M.div(a)).pow(0.25))
        .add(1)
        .atan()

    const numerator = numeratorTerm1.sub(numeratorTerm2).add(numeratorTerm3);
    const denominator = Decimal(2).mul(Decimal(2).sqrt()).mul((a.pow(3).mul(M)).pow(0.25))
    const result = numerator.div(denominator);
    return result;
  }
  return integral(Vt1).sub(integral(Vt0));
}

function getTokensForBuyWithRectangles (Vt0, deltaETH, MCReth, stepSize) {
  Vt0 = Decimal(Vt0);
  deltaETH = Decimal(deltaETH);
  stepSize = stepSize ? Decimal(stepSize) : Decimal(0.01);
  const Vt1 = Vt0.add(deltaETH);
  let previousV;
  let currentV = Vt0;
  let previousPrice;
  let totalTokens = Decimal(0);

  let iterations = 0;
  while (deltaETH.gt('0')) {
    const MCRPerc = currentV.div(MCReth);
    const currentPrice = getPriceDecimal(MCRPerc, MCReth);
    if (previousPrice && previousV) {
      const averagePrice = currentPrice.add(previousPrice).div(2);
      const deltaTokens = currentV.sub(previousV).div(averagePrice);
      totalTokens = totalTokens.add(deltaTokens);
    }
    previousV = currentV;
    previousPrice = currentPrice;
    currentV = currentV.add(stepSize);
    deltaETH = deltaETH.sub(stepSize);
    iterations++;
  }

  return totalTokens;
}

function getTokensWithSteps(_poolBalance, weiPaid, totalSupply, _mcrFullPerc, _vFull, _mcrtp) {
  const priceStep = Decimal(1000);
  const DECIMAL1E18 = Decimal(1e18);
  let tokenPrice;
  let superWeiLeft = (_weiPaid).mul(DECIMAL1E18);
  let tempTokens;
  let superWeiSpent;

  let vtp;

//        (vtp, ) = m1.calculateVtpAndMCRtp((_poolBalance).sub(_weiPaid));

  while (superWeiLeft > 0) {
    mcrtp = (mcrFullperc.mul(vtp)).div(vFull);
    tokenPrice = getPriceDecimal(mcrtp);
    tempTokens = superWeiLeft.div(tokenPrice);
    if (tempTokens <= priceStep.mul(DECIMAL1E18)) {
      tokenToGet = tokenToGet.add(tempTokens);
      break;
    } else {
      tokenToGet = tokenToGet.add(priceStep.mul(DECIMAL1E18));
      tokenSupply = tokenSupply.add(priceStep.mul(DECIMAL1E18));
      superWeiSpent = priceStep.mul(DECIMAL1E18).mul(tokenPrice);
      superWeiLeft = superWeiLeft.sub(superWeiSpent);
      vtp = vtp.add((priceStep.mul(DECIMAL1E18).mul(tokenPrice)).div(DECIMAL1E18));
    }
  }
}

function mConstant(MCReth) {
  return Decimal(1).div(Decimal(MCReth).pow(3).mul(C))
}

function getPrice(MCRPerc, MCReth) {
  return A + MCReth / C * MCRPerc ** 4
}

function getPriceDecimal(MCRPerc, MCReth) {
  return Decimal(A).add(Decimal(MCReth).div(C).mul(Decimal(MCRPerc).pow(4)))
}

function adjustPriceFormulaIntegral(point, MInverted) {
  return Decimal(-1).div(3).mul(MInverted).div(Decimal(point).pow(3));
}

function getTokensWithAdjustedPriceFormula(Vt0, deltaETH, MCReth) {

  const MInverted = Decimal(MCReth).pow(3).mul(C);
  Vt0 = Decimal(Vt0);
  deltaETH = Decimal(deltaETH);
  const Vt1 = Vt0.add(deltaETH);
  function integral(point, MInverted) {
    return Decimal(-1).div(3).mul(MInverted).div(Decimal(point).pow(3));
  }
  const adjustedTokenAmount = integral(Vt1, MInverted).sub(integral(Vt0, MInverted));
  const averageAdjustedPrice = deltaETH.div(adjustedTokenAmount);
  const genuinePrice = averageAdjustedPrice.add(Decimal(A));
  const tokens = deltaETH.div(genuinePrice);
  return tokens;
}

function getTokensWithAdjustedPriceFormulaWithMCRPerc(Vt0, deltaETH, MCReth) {
  const c = Decimal(C);
  MCReth = Decimal(MCReth);
  const MInverted = c.div(Decimal(MCReth));
  Vt0 = Decimal(Vt0);
  deltaETH = Decimal(deltaETH);
  const Vt1 = Vt0.add(deltaETH);
  const MCRPerc0 = Vt0.div(MCReth);
  const MCRPerc1 = Vt1.div(MCReth);
  function integral(point) {
    return Decimal(-1).div(3).mul(MInverted).div(Decimal(point).pow(3))
  }
  const adjustedTokenAmount = (integral(MCRPerc1).sub(integral(MCRPerc0))).mul(MCReth);
  const averageAdjustedPrice = deltaETH.div(adjustedTokenAmount);
  const genuinePrice = averageAdjustedPrice.add(Decimal(A));

  const tokens = deltaETH.div(genuinePrice);
  return tokens;
}

function computeSellPrice(Vt0, MCReth, nxmToSell, iterations) {
  /*
    Work out ETH based spot price -> ETH(1)
    Work out ETH based on V(1) = V(0) - ETH(1) -> ETH(2)
    Work out ETH based on V(2) = V(0) - avg(ETH1, ETH2) -> ETH(3)
    Work out ETH based on V(3) = V(0) - avg( two ETH(x) that most closely bound the right result) -> ETH(4)
    Choose ETH to be the lower result of ETH(4) and ETH(3)
  */

  Vt0 = Decimal(Vt0);
  MCReth = Decimal(MCReth);
  nxmToSell = Decimal(nxmToSell);
  const MCRPerc = Vt0.div(MCReth);
  const spotPrice = getPriceDecimal(MCRPerc, MCReth);
  let ethEstimate = spotPrice.mul(nxmToSell);
  const MInverted = Decimal(MCReth).pow(3).mul(C);
  let tokensAmount;
  let prevEthEstimate;
  let ethEstimateLeftBound = ethEstimate.div(2);
  let ethEstimateRightBound = ethEstimate;
  for (let i = 0; i < iterations; i++) {
    const midEth = ethEstimateLeftBound.add(ethEstimateRightBound).div(2);
    let Vt1 = Vt0.sub(midEth);
    tokensAmount = adjustPriceFormulaIntegral(Vt0, MInverted).sub(adjustPriceFormulaIntegral(Vt1, MInverted));

    if (tokensAmount.lt(nxmToSell)) {
      ethEstimateLeftBound = midEth;
    } else {
      ethEstimateRightBound = midEth;
    }
  }
  return {
    tokensAmount,
    ethEstimate
  };
}

async function dataSet1() {
  const MCReth = 18000

  const ETHAsset = 30000
  const DAIAsset = 50000

  const DAIETHRate = 1/235

  const Vt0 = ETHAsset + DAIAsset * DAIETHRate
  const MCRPerct0 = Vt0 / MCReth


  const deltaDAI = 100000
  const deltaETH = deltaDAI * DAIETHRate

  const Vt1 = Vt0 + deltaETH
  const MCRPerct1 = Vt1 / MCReth

  // const rectangleTokens = getTokensForBuyWithRectangles(Vt0, deltaETH, MCReth, Decimal(0.0001));
  //
  // console.log({
  //   rectangleTokens
  // });

  const price0 = getPrice(MCRPerct0, MCReth);
  const price1 = getPrice(MCRPerct1, MCReth);

  const priceDecimal = getPriceDecimal(MCRPerct1, MCReth);

  const m = mConstant(MCReth).toFixed();

  const tokensWithAdjusted = getTokensWithAdjustedPriceFormula(Vt0, deltaETH, MCReth);
  const tokensWithAdjustedWithMCRPerc = getTokensWithAdjustedPriceFormulaWithMCRPerc(Vt0, deltaETH, MCReth);

  const fullIntegralTokens = getTokensForBuy(Vt0, deltaETH, MCReth);

  const sellPrice = computeSellPrice(Vt1, MCReth, fullIntegralTokens, 12);

  console.log({
    // DAIETHRate,
    // Vt0,
    // MCRPerct0,
    // deltaETH,
    // Vt1,
    // MCRPerct1,
    // price0,
    // price1,
    // priceDecimal,
    // m,
    tokensWithAdjusted,
    tokensWithAdjustedWithMCRPerc,
    fullIntegralTokens,
    sellPrice
  });
}

async function dataSet2() {
  const MCReth = 180000

  const ETHAsset = 300000
  const DAIAsset = 500000

  const DAIETHRate = 1/235

  const Vt0 = ETHAsset + DAIAsset * DAIETHRate
  const MCRPerct0 = Vt0 / MCReth


  const deltaDAI = 1000000
  const deltaETH = deltaDAI * DAIETHRate

  const Vt1 = Vt0 + deltaETH
  const MCRPerct1 = Vt1 / MCReth

  const price0 = getPrice(MCRPerct0, MCReth);
  const price1 = getPrice(MCRPerct1, MCReth);

  const m = mConstant(MCReth).toFixed();

  console.log({
    DAIETHRate,
    Vt0,
    MCRPerct0,
    deltaETH,
    Vt1,
    MCRPerct1,
    price0,
    price1,
    m
  });

  const adjusted = getTokensWithAdjustedPriceFormula(Vt0, deltaETH, MCReth);
  console.log({
    adjusted
  });

  const rectangleTokens = getTokensForBuyWithRectangles(Vt0, deltaETH, MCReth, Decimal(0.001))

  console.log({
    rectangleTokens
  })
}

async function dataSet3() {
  let MCReth = 18000

  let ETHAsset = 30000
  const DAIAsset = 50000

  const DAIETHRate = 1/235

  const errorMargin = Decimal(0.0001)

  const results = [];
  for (let i = 0; i < 1000; i++) {
    const Vt0 = ETHAsset + DAIAsset * DAIETHRate
    const deltaDAI = 100000
    const deltaETH = deltaDAI * DAIETHRate

    const Vt1 = Vt0 + deltaETH
    const MCRPerct0 = Vt0 / MCReth * 100
    const MCRPerct1 = Vt1 / MCReth * 100
    const adjustedFormulaResult = getTokensWithAdjustedPriceFormula(Vt0, deltaETH, MCReth);
    const tokensWithAdjustedWithMCRPerc = getTokensWithAdjustedPriceFormulaWithMCRPerc(Vt0, deltaETH, MCReth);
    const fullIntegralTokens = getTokensForBuy(Vt0, deltaETH, MCReth);
    const errorLimit = errorMargin.mul(fullIntegralTokens);
    const absoluteDifference = fullIntegralTokens.sub(tokensWithAdjustedWithMCRPerc).abs();
    const isWithinErrorMargin = errorLimit.gt(absoluteDifference)
    const sellSlippage = Decimal(0.001);

    const { tokensAmount: sellPrice } = computeSellPrice(Vt1, MCReth, fullIntegralTokens, 10);
    const slippageMargin = sellSlippage.mul(fullIntegralTokens);

    const absDiffSell = fullIntegralTokens.sub(sellPrice).abs();
    const sellWithinErrorMargin =  slippageMargin.gt(absDiffSell);
    const result = {
      MCReth,
      ETHAsset,
      DAIAsset,
      DAIETHRate,
      deltaETH,
      Vt0,
      Vt1,
      MCRPerct0,
      MCRPerct1,
      adjustedFormulaResult,
      tokensWithAdjustedWithMCRPerc,
      fullIntegralTokens,
      sellPrice,
      isWithinErrorMargin,
      sellWithinErrorMargin
    }
    console.log(result);
    if (!isWithinErrorMargin) {
      throw Error('Not within error margin');
    }

    if (!sellWithinErrorMargin) {
      throw Error('Not within error margin for sell');
    }
    ETHAsset += 1000;
    MCReth += 1000;

    results.push(result);
  }

  fs.writeFileSync('./large-data-set-results.json', JSON.stringify(results));
  const keys = Object.keys(results[0]);
  let buffer = [keys.join(',')];
  for (const row of results) {
    const chunks = [];
    for (const key of keys) {
      chunks.push(row[key]);
    }
    buffer.push(chunks.join(','));
  }
  const text = buffer.join('\n');
  fs.writeFileSync('./large-data-set-results-high-MCR.csv', text);
}

dataSet1()
//dataSet2()
// dataSet3()

