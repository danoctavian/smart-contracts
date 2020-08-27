const Decimal = require('decimal.js');

const A = 0.01028
const C = 5800000

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




function getPrice(MCRPerc, MCReth) {
  return A + MCReth / C * MCRPerc ** 4
}

function getPriceDecimal(MCRPerc, MCReth) {
  return Decimal(A).add(Decimal(MCReth).div(C).mul(Decimal(MCRPerc).pow(4)))
}

const price0 = getPrice(MCRPerct0, MCReth);
const price1 = getPrice(MCRPerct1, MCReth);

const priceDecimal = getPriceDecimal(MCRPerct1, MCReth);

console.log({
  DAIETHRate,
  Vt0,
  MCRPerct0,
  deltaETH,
  Vt1,
  MCRPerct1,
  price0,
  price1,
  priceDecimal
});


const finalTokens = 11947.546234

function getM1(m0, tokens, MCReth) {
  return m0 -   tokens * getPrice(m0, MCReth) / (2 * MCReth)
}


const getTokensForBuy = (Vt0, deltaETH) => {
  Vt0 = Decimal(Vt0);
  deltaETH = Decimal(deltaETH);
  const Vt1 = Vt0.add(deltaETH);

  const MCRethDecimal = Decimal(MCReth);
  const CDecimal = Decimal(C);
  const M = Decimal(1).div(CDecimal.mul(MCRethDecimal.pow(3)));
  console.log(M.toFixed());
  function integral(point) {
    const numerator = (M.div(A).sqrt().mul(point.pow(2))).atan();
    const denominator = M.mul(A).sqrt().mul(2);
    const value = numerator.div(denominator);
    return value
  }
  return integral(Vt1).sub(integral(Vt0));
}

function getTokensForBuyWithRectangles (Vt0, deltaETH, MCReth, stepSize) {
  Vt0 = Decimal(Vt0);
  deltaETH = Decimal(deltaETH);
  stepSize = stepSize ? Decimal(stepSize) : Decimal(0.001);
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

const rectangleTokens = getTokensForBuyWithRectangles(Vt0, deltaETH, MCReth);

console.log({
  rectangleTokens
});

const priceStep = Decimal(1000);
const DECIMAL1E18 = Decimal(1e18);
function getTokensWithSteps(_poolBalance, weiPaid, totalSupply, _mcrFullPerc, _vFull, _mcrtp) {

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

console.log(getM1(MCRPerct1, finalTokens, MCReth))

const tokens = getTokensForBuy(Vt0, deltaETH);
console.log(tokens.toString())
//console.log(Decimal(deltaETH).div(tokens).mul(1e11));
