const fetch = require('node-fetch')
const regression = require('regression');
const ss = require('simple-statistics');

async function getData(symbol, endTimestamp) {
  const url = `https://min-api.cryptocompare.com/data/v2/histohour?fsym=${symbol}&tsym=USD&limit=100&toTs=${endTimestamp}`
  const response = await fetch(url)
  const data = await response.json()
  const prices = data['Data']['Data'];
  return prices
}

async function main(symbol1, symbol2, endDate) {
  const btcPrices = await getData(symbol1, endDate)
  const ethPrices = await getData(symbol2, endDate)
  const btcClose = btcPrices.map(price => price.close)
  const ethClose = ethPrices.map(price => price.open)
  console.log("BTC", btcClose)
  const correlation = correlationCoefficient(btcClose, ethClose)
  console.log("Correlation", correlation)
  const leadingIndicator = grangerCausality(btcClose, ethClose)
  console.log(leadingIndicator)
  makeTrade(btcClose, ethClose)
}

function makeTrade(priceArray1, priceArray2, maxlag = 1, buyThreshold = 1.5, sellThreshold = 0.5) {
  const { F1, F2 } = grangerCausality(priceArray1, priceArray2, maxlag);
  
  if (F1 > buyThreshold) {
    // Generate a buy signal for priceArray1
    console.log("Buy signal for priceArray1");
  }
  
  if (F2 > buyThreshold) {
    // Generate a buy signal for priceArray2
    console.log("Buy signal for priceArray2");
  }
  
  if (F1 < sellThreshold) {
    // Generate a sell signal for priceArray1
    console.log("Sell signal for priceArray1");
  }
  
  if (F2 < sellThreshold) {
    // Generate a sell signal for priceArray2
    console.log("Sell signal for priceArray2");
  }
}

// Function that returns correlation coefficient.
function correlationCoefficient(X, Y) {
  let n = X.length;
  let sum_X = 0,
    sum_Y = 0,
    sum_XY = 0;
  let squareSum_X = 0,
    squareSum_Y = 0;
  for (let i = 0; i < n; i++) {
    // Sum of elements of array X.
    sum_X = sum_X + X[i];

    // Sum of elements of array Y.
    sum_Y = sum_Y + Y[i];

    // Sum of X[i] * Y[i].
    sum_XY = sum_XY + X[i] * Y[i];

    // Sum of square of array elements.
    squareSum_X = squareSum_X + X[i] * X[i];
    squareSum_Y = squareSum_Y + Y[i] * Y[i];
  }

  // Use formula for calculating correlation
  // coefficient.
  let corr = (n * sum_XY - sum_X * sum_Y) /
    (Math.sqrt((n * squareSum_X -
        sum_X * sum_X) *
      (n * squareSum_Y -
        sum_Y * sum_Y)));

  return corr;
}




//////////////////////////////////////////

function grangerCausality(priceArray1, priceArray2, maxlag = 1) {
  if (priceArray1.length !== priceArray2.length) {
    throw new Error("Input arrays must have the same length.");
  }

  if (priceArray1.length < maxlag + 1) {
    throw new Error("Input arrays must have a length greater than maxlag.");
  }

  function lagArray(array, lag) {
    return array.slice(0, array.length - lag);
  }

  function calculateRSS(y, x) {
    const result = regression.linear(x.map((_, i) => [x[i], y[i]]));
    const residuals = y.map((_, i) => y[i] - result.predict(x[i])[1]);
    return ss.sum(residuals.map(r => r * r));
  }

  const Y1 = priceArray1.slice(maxlag);
  const Y2 = priceArray2.slice(maxlag);
  const X1 = lagArray(priceArray1, 1);
  const X2 = lagArray(priceArray2, 1);

  const restrictedModelRSS1 = calculateRSS(Y1, X1);
  const restrictedModelRSS2 = calculateRSS(Y2, X2);

  const unrestrictedModelX1 = X2;
  const unrestrictedModelX2 = X1;

  const unrestrictedModelRSS1 = calculateRSS(Y1, unrestrictedModelX1);
  const unrestrictedModelRSS2 = calculateRSS(Y2, unrestrictedModelX2);

  const n = Y1.length;
  const F1 = ((restrictedModelRSS1 - unrestrictedModelRSS1) / maxlag) / (unrestrictedModelRSS1 / (n - 2 * maxlag));
  const F2 = ((restrictedModelRSS2 - unrestrictedModelRSS2) / maxlag) / (unrestrictedModelRSS2 / (n - 2 * maxlag));

  return { F1, F2 };
}
//////////////////////////////////////////


const endDate = new Date('2021-05-03')
main('BTC', 'ETH', endDate.getTime())