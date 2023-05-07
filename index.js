const fetch = require('node-fetch')
const regression = require('regression');
const ss = require('simple-statistics');
const fs = require('fs').promises;


class Portfolio {
  constructor() {
    this.positions = {
      symbol1: 0,
      symbol2: 0,
    };
    this.cash = 100000; // Starting cash
  }

  update(symbol, quantity, price) {
    if (symbol === 'symbol1') {
      this.positions.symbol1 += quantity;
    } else if (symbol === 'symbol2') {
      this.positions.symbol2 += quantity;
    }
    this.cash -= quantity * price;
  }

  value(prices) {
    return (
      this.cash +
      this.positions.symbol1 * prices.symbol1 +
      this.positions.symbol2 * prices.symbol2
    );
  }

	print(prices, text="") {
		const portfolioValue = this.value(prices);
		console.log(`Total Value: ${portfolioValue}, ${text}, Symbol1: ${this.positions.symbol1}, Symbol2: ${this.positions.symbol2}, Cash: ${this.cash}`)
	}
}

async function main(symbol1, symbol2, endDate, period) {
  const portfolio = new Portfolio();
  let date = new Date(endDate);

  for (let i = 0; i < period; i++) {
    const otherPrices = await getData(symbol1, date.getTime());
    const ethPrices = await getData(symbol2, date.getTime());
    if (otherPrices === undefined || ethPrices === undefined ) {
      continue
    }
    const otherClose = otherPrices.map((price) => price.close);
    const ethClose = ethPrices.map((price) => price.close);

    const tradeDecision = makeTrade(portfolio, otherClose, ethClose);
    if (tradeDecision.symbol1) {
      portfolio.update('symbol1', tradeDecision.symbol1, otherClose[otherClose.length - 1]);
    }
    if (tradeDecision.symbol2) {
      portfolio.update('symbol2', tradeDecision.symbol2, ethClose[ethClose.length - 1]);
    }

    // const portfolioValue = portfolio.value({
    //   symbol1: otherClose[otherClose.length - 1],
    //   symbol2: ethClose[ethClose.length - 1],
    // });
    // console.log(`Portfolio value at time ${i}: ${portfolioValue}`);
		if (i == period - 1) {
			portfolio.print({
				symbol1: otherClose[otherClose.length - 1],
				symbol2: ethClose[ethClose.length - 1],
			}, `Trading Pair: ${symbol1}-${symbol2}`)
		}

    date.setDate(date.getDate() - 1); // Move back one day
  }
}

function makeTrade(portfolio, priceArray1, priceArray2, maxlag = 1, buyThreshold = 1.5, sellThreshold = 0.5) {
  const { F1, F2 } = grangerCausality(priceArray1, priceArray2, maxlag);
  const correlation = correlationCoefficient(priceArray1, priceArray2);

  const tradeDecision = {
    symbol1: 0,
    symbol2: 0,
  };

	// Calculate position sizes based on F1, F2, and correlation
	const positionSize1 = F1**2 * (Math.max(correlation, 0));
	const positionSize2 = F2**2 * (Math.max(correlation, 0));

	// Calculate current value of the portfolio
	const currentPortfolioValue = portfolio.value({
		symbol1: priceArray1[priceArray1.length - 1],
		symbol2: priceArray2[priceArray2.length - 1],
	});

	// Calculate the maximum USD position size based on our portfolio with leverage
	const maxUsdPositionSize1 = 10 * currentPortfolioValue;
	const maxUsdPositionSize2 = 10 * currentPortfolioValue;

	// Limit the position size to 10% of the dollar value of our portfolio in terms of token amount
	const maxPositionSize1 = Math.min(positionSize1, maxUsdPositionSize1 / priceArray1[priceArray1.length - 1]);
	const maxPositionSize2 = Math.min(positionSize2, maxUsdPositionSize2 / priceArray2[priceArray2.length - 1]);


  if (F1 > buyThreshold) {
    tradeDecision.symbol1 = maxPositionSize1;
  }

  if (F2 > buyThreshold) {
    tradeDecision.symbol2 = maxPositionSize2;
  }

  if (F1 < sellThreshold) {
    tradeDecision.symbol1 = -maxPositionSize1;
  }

  if (F2 < sellThreshold) {
    tradeDecision.symbol2 = -maxPositionSize2;
  }

  return tradeDecision;
}

async function getData(symbol, endTimestamp) {
  const cacheFileName = `cache_${symbol}_${endTimestamp}.json`;

  try {
    // Try reading from the cache file
    const cacheFileContent = await fs.readFile(cacheFileName, 'utf8');
    const cachedPrices = JSON.parse(cacheFileContent);
    return cachedPrices;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Error reading cache file:', error);
    }
  }

  // If cache file does not exist or there was an error, fetch new data
  const url = `https://min-api.cryptocompare.com/data/v2/histohour?fsym=${symbol}&tsym=USD&limit=100&toTs=${endTimestamp}`;
  const response = await fetch(url);
  const data = await response.json();
  const prices = data['Data']['Data'];

  try {
    // Save fetched data to cache file
    await fs.writeFile(cacheFileName, JSON.stringify(prices), 'utf8');
    console.log('Data fetched and cached');
  } catch (error) {
    console.error('Error writing cache file:', error);
  }

  return prices;
}

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


async function holdLongSymbol(symbol, endDate, period) {
  const portfolio = new Portfolio();
  let date = new Date(endDate);

  const ethPrices = await getData(symbol, date.getTime());
	const ethClose = ethPrices.map((price) => price.close);
	const maxEthAvailable = 100000 * ethClose[ethClose.length - 1]
	portfolio.update('symbol1', maxEthAvailable, ethClose[ethClose.length - 1]);

	date.setDate(date.getDate() - period + 1); 
	const endEthPrices = await getData(symbol, date.getTime());
	const endEthClose = endEthPrices.map((price) => price.close);

	console.log("VALUE OF HOLDING ETH: ", maxEthAvailable * 1 / endEthClose[endEthClose.length - 1])
}


const endDate = new Date('2021-05-03');
// const endDate = new Date('2022-12-03');
// main('BTC', 'ETH', endDate.getTime(), 100); // Backtest for 100 periods
main('ETH', 'BTC', endDate.getTime(), 50);
main('ETH', 'DOGE', endDate.getTime(), 50); 
main('ETH', 'BNB', endDate.getTime(), 50); 
main('ETH', 'SHIB', endDate.getTime(), 50); 
main('ETH', 'AAVE', endDate.getTime(), 50); 
main('ETH', 'ARB', endDate.getTime(), 50); 
holdLongSymbol("ETH",endDate.getTime(), 50)