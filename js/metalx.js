'use strict';

// ----------------------------------------------------------------------------

const Exchange = require ('./base/Exchange');
const { ExchangeError, ArgumentsRequired, AuthenticationError, RateLimitExceeded } = require ('./base/errors');

// ----------------------------------------------------------------------------

module.exports = class metalx extends Exchange {
    describe () {
        return this.deepExtend (super.describe (), {
            'id': 'metalx',
            'name': 'Metalx',
            'countries': ['US', 'EU'],
            'version': 'v1',
            'rateLimit': 400,  // 10k calls per hour
            'has': {
                'fetchTicker': true,
                'fetchCurrencies': true,
                'fetchOrderBook': true,
                'fetchTrades': true,
                'fetchOHLCV': true,
                'fetchBalance': true,
                'createOrder': true,
                'cancelOrder': true,
                'fetchOrder': true,
                'fetchOpenOrders': true,
                'fetchOrders': true,
                'fetchMyTrades': true,
                'fetchDepositAddress': true,
                'fetchDeposits': true,
                'fetchWithdrawals': true,
                'fetchTransactions': false,
                'withdraw': true,
            },
            'timeframes': {
                '1m': '1m',
                '5m': '5m',
                '30m': '30m',
                '1h': '1h',
                '1d': '1d',
            },
            'urls': {
                'logo': 'https://user-images.githubusercontent.com/11918446/82477414-5162a000-9a84-11ea-8107-a4070b1c2e81.png',
                'api': 'https://api-staging.metalx.com',
                'www': 'https://www.metalx.com',
                'doc': 'https://developers.metalx.com/api',
            },
            'api': {
                'public': {
                    'get': [
                        'exchange-info', // fetchMarkets
                        'tickers', // fetchTicker
                        'assets', // fetchCurrencies
                        'depth', // fetchOrderBook
                        'trades', // fetchTrades
                        'ohlcv', // fetchOHLCV
                    ],
                },
                'private': {
                    'get': [
                        'account', // fetchBalance
                        'deposits', // fetchDeposits
                        'withdrawals', // fetchWithdrawals
                        'orders', // fetchOpenOrders, fetchAllOrders
                        'orders/{orderId}', // getOrder,
                        'trades/me', // fetchMyTrades
                        'address/deposit', // fetchDepositAddress
                    ],
                    'post': [
                        'orders', // createOrder
                        'withdraw', // withdraw
                    ],
                    'put': [
                        'orders/cancel', // cancelOrder
                    ],
                },
            },
            'exceptions': {
                'two_factor_required': AuthenticationError, // 402 When sending money over 2fa limit
                'param_required': ExchangeError, // 400 Missing parameter
                'validation_error': ExchangeError, // 400 Unable to validate POST/PUT
                'invalid_request': ExchangeError, // 400 Invalid request
                'authentication_error': AuthenticationError, // 401 Invalid auth (generic)
                'invalid_token': AuthenticationError, // 401 Invalid Oauth token
                'revoked_token': AuthenticationError, // 401 Revoked Oauth token
                'expired_token': AuthenticationError, // 401 Expired Oauth token
                'invalid_scope': AuthenticationError, // 403 User hasn’t authenticated necessary scope
                'not_found': ExchangeError, // 404 Resource not found
                'rate_limit_exceeded': RateLimitExceeded, // 429 Rate limit exceeded
                'internal_server_error': ExchangeError, // 500 Internal server error
            },
            'options': undefined,
        });
    }

    async fetchMarkets (params = {}) {
        const response = await this.publicGetExchangeInfo (params);
        // {
        //   "timezone": "UTC",
        //   "serverTime": 1589483200696,
        //   "symbols": [
        //       {
        //           "symbol": "MTLBTC",
        //           "status": "running",
        //           "baseAsset": "MTL",
        //           "baseAssetPrecision": 8,
        //           "quoteAsset": "BTC",
        //           "quotePrecision": 8,
        //           "baseCommissionPrecision": 8,
        //           "quoteCommissionPrecision": 8,
        //           "orderTypes": [
        //               "LIMIT",
        //               "LIMIT_MAKER",
        //               "MARKET",
        //               "STOP_LOSS",
        //               "STOP_LOSS_LIMIT",
        //               "TAKE_PROFIT",
        //               "TAKE_PROFIT_LIMIT"
        //           ],
        //           "isSpotTradingAllowed": true,
        //           "isMarginTradingAllowed": false
        //         }
        //       ],
        //   }
        const result = [];
        for (let i = 0; i < response.symbols.length; i++) {
            const market = response[i];
            const id = this.safeString (market, 'symbol');
            const baseId = this.safeString (market, 'baseAsset');
            const quoteId = this.safeString (market, 'quoteAsset');
            const base = this.safeCurrencyCode (baseId);
            const quote = this.safeCurrencyCode (quoteId);
            const symbol = base + '/' + quote;
            const precision = {
                'amount': this.safeInteger (market, 'quotePrecision'),
                'price': this.safeInteger (market, 'quoteCommissionPrecision'),
            };
            const status = this.safeString (market, 'status');
            const active = (status === 'running');
            result.push ({
                'id': id,
                'symbol': symbol,
                'base': base,
                'quote': quote,
                'baseId': baseId,
                'quoteId': quoteId,
                'info': market,
                'active': active,
                'precision': precision,
                'limits': {
                    'amount': { 'min': undefined, 'max': undefined },
                    'price': { 'min': undefined, 'max': undefined },
                    'cost': { 'min': undefined, 'max': undefined },
                },
            });
        }
        return result;
    }

    async fetchCurrencies (params = {}) {
        const response = await this.publicGetAssets (params);
        // [
        //   {
        //       "id": "BTC",
        //       "code": "BTC",
        //       "name": "Bitcoin",
        //       "active": true,
        //       "fee": 0.0003,
        //       "precision": 8
        //   },
        // ]
        const result = {};
        for (let i = 0; i < response.length; i++) {
            const currency = response[i];
            const id = this.safeString (currency, 'id');
            const code = this.safeString (currency, 'code');
            const name = this.safeString (currency, 'name');
            const active = this.safeValue (currency, 'active');
            const fee = this.safeFloat (currency, 'fee');
            const precision = this.safeInteger (currency, 'precision');
            result[code] = {
                'id': id,
                'code': code,
                'info': currency,
                'name': name,
                'active': active,
                'fee': fee,
                'precision': precision,
                'limits': {
                    'amount': {
                        'min': Math.pow (10, -precision),
                        'max': undefined,
                    },
                    'price': {
                        'min': Math.pow (10, -precision),
                        'max': undefined,
                    },
                    'cost': {
                        'min': undefined,
                        'max': undefined,
                    },
                    'withdraw': {
                        'min': undefined,
                        'max': undefined,
                    },
                },
            };
        }
        return result;
    }

    async fetchOrderBook (symbol, limit = undefined, params = {}) {
        if (symbol === undefined) {
            throw new ArgumentsRequired (this.id + ' fetchOrderBook requires a symbol argument');
        }
        await this.loadMarkets ();
        const market = this.market (symbol);
        const request = {
            'symbol': market['id'],
        };
        if (limit !== undefined) {
            request['depth'] = limit;
        }
        const response = await this.publicGetDepth (this.extend (request, params));
        // {
        //     "serverTime": 1589494284189,
        //     "dateTime": "2020-05-14T22:11:24.189Z",
        //     "bids": [
        //      {
        //         "quantity": 227,
        //         "price": 0.00002931
        //      },
        //      {
        //         "quantity": 264,
        //         "price": 0.00002928
        //      }
        //    ],
        //     "asks": [
        //      {
        //        "quantity": 802,
        //        "price": 0.00002943
        //      },
        //      {
        //        "quantity": 2905,
        //        "price": 0.00002944
        //      },
        // }
        const bids = [];
        for (let i = 0; i < response.bids.length; i++) {
            const bid = response.bids[i];
            bids.push (Object.values (bid));
        }
        response['bids'] = bids;
        const asks = [];
        for (let i = 0; i < response.asks.length; i++) {
            const ask = response.asks[i];
            asks.push (Object.values (ask));
        }
        response['asks'] = asks;
        const timestamp = this.safeInteger (response, 'serverTime');
        const result = this.parseOrderBook (response, timestamp);
        result['nonce'] = timestamp;
        return result;
    }

    async fetchTrades (symbol, since = undefined, limit = undefined, params = {}) {
        if (symbol === undefined) {
            throw new ArgumentsRequired (this.id + ' fetchOrderBook requires a symbol argument');
        }
        await this.loadMarkets ();
        const market = this.market (symbol);
        const request = {
            'symbol': market['id'],
        };
        if (limit !== undefined) {
            request['limit'] = limit;
        }
        const response = await this.publicGetTrades (this.extend (request, params));
        return this.parseTrades (response, market, since, limit);
    }

    async parseTrade (trade, market = undefined) {
        // PUBLIC fetchtrades
        // [
        //   {
        //       "timestamp": 1589493840302,
        //       "datetime": "2020-05-14T22:04:00.302Z",
        //       "symbol": "MTLBTC",
        //       "price": "0.00002947",
        //       "amount": "1.28985624",
        //       "cost": "0.0000380120633928"
        //   },
        // ]
        // PRIVATE fetchTrades
        //     [
        // {
        //     "id": "2419962",
        //     "timestamp": 1589292571101,
        //     "datetime": "2020-05-12T14:09:31.101Z",
        //     "symbol": "MTL/BTC",
        //     "order": 1975994,
        //     "type": "Market",
        //     "side": "sell",
        //     "takerOrMaker": "taker",
        //     "price": "0.0016",
        //     "amount": "1",
        //     "cost": "0.0016",
        //     "fee": {
        //         "cost": "8e-7",
        //         "currency": "BTC"
        //     }
        // },
        const timestamp = this.safeInteger (trade, 'timestamp');
        const price = this.safeFloat (trade, 'price');
        const amount = this.safeFloat (trade, 'amount');
        const cost = this.safeFloat (trade, 'cost');
        let symbol = undefined;
        if (market === undefined) {
            const marketId = this.safeString (trade, 'symbol');
            market = this.safeValue (this.markets_by_id, marketId);
        }
        if (market !== undefined) {
            symbol = market['symbol'];
        }
        // Revisit later when doing personal trades
        const id = this.safeString (trade, 'id');
        const order = this.safeString (trade, 'order');
        const type = this.safeString (trade, 'type');
        const takerOrMaker = this.safeString (trade, 'takerOrMaker');
        const side = this.safeString (trade, 'side');
        const fee = this.safeValue (trade, 'fee');
        return {
            'info': trade,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'symbol': symbol,
            'id': id,
            'order': order,
            'type': type,
            'takerOrMaker': takerOrMaker,
            'side': side,
            'price': price,
            'amount': amount,
            'cost': cost,
            'fee': fee,
        };
    }

    async fetchOHLCV (symbol, timeframe = '1m', since = undefined, limit = undefined, params = {}) {
        if (symbol === undefined) {
            throw new ArgumentsRequired (this.id + ' fetchOrderBook requires a symbol argument');
        }
        if (since === undefined) {
            throw new ArgumentsRequired (this.id + ' fetchOrderBook requires a since argument');
        }
        await this.loadMarkets ();
        const market = this.market (symbol);
        const request = {
            'symbol': market['id'],
            'interval': this.timeframes[timeframe],
        };
        if (since !== undefined) {
            request['since'] = since;
        } else {
            request['since'] = new Date ();
        }
        if (limit !== undefined) {
            request['limit'] = limit;
        }
        const response = await this.publicGetOhlcv (this.extend (request, params));
        return this.parseOHLCVs (response, market, timeframe, since, limit);
    }

    parseOHLCV (ohlcv, market = undefined, timeframe = '1m', since = undefined, limit = undefined) {
        // [
        //   1589328000000,
        //   0.0015,
        //   0.0016,
        //   0.00003103,
        //   0.00003143,
        //   418.09725549
        // ],
        return [
            parseInt (ohlcv[0]),
            parseFloat (ohlcv[1]),
            parseFloat (ohlcv[2]),
            parseFloat (ohlcv[3]),
            parseFloat (ohlcv[4]),
            parseFloat (ohlcv[5]),
        ];
    }

    async fetchBalance (params = {}) {
        await this.loadMarkets ();
        const response = await this.privateGetAccount (params);
        // {
        //   "accountType": "spot",
        //   "balances": [
        //       {
        //           "asset": "BTC",
        //           "free": "1.8757842855900473",
        //           "locked": "0"
        //       },
        //       {
        //           "asset": "LTC",
        //           "free": "0",
        //           "locked": "0"
        //       },
        // }
        const result = { 'info': response };
        const balances = this.safeValue (response, 'balances');
        for (let i = 0; i < balances.length; i++) {
            const balance = balances[i];
            const currencyId = this.safeString (balance, 'asset');
            const code = this.safeCurrencyCode (currencyId);
            const account = this.account ();
            account['free'] = this.safeFloat (balance, 'free');
            account['locked'] = this.safeFloat (balance, 'locked');
            account['total'] = this.sum (account['free'], account['locked']);
            result[code] = account;
        }
        return this.parseBalance (result);
    }

    async createOrder (symbol, type, side, amount, price = undefined, params = {}) {
        await this.loadMarkets ();
        const market = this.market (symbol);
        if (type === 'limit' && price === undefined) {
            throw new ExchangeError (this.id + ' CreateOrder() requires limit price for limit orders');
        }
        const request = {
            'symbol': market['id'],
            'side': side,
            'type': type,
            'quantity': amount,
        };
        if (type === 'limit') {
            request['limitPrice'] = this.priceToPrecision (symbol, price);
        }
        const response = await this.privatePostOrders (this.extend (request, params));
        return {
            'info': response,
            'id': this.parseString (response, 'orderId'),
        };
    }

    async cancelOrder (id, symbol = undefined, params = {}) {
        if (id === undefined) {
            throw new ArgumentsRequired (this.id + ' cancelOrder() requires an order id');
        }
        await this.loadMarkets ();
        const request = {
            'orderId': id,
        };
        const response = await this.privatePutOrdersCancel (this.extend (request, params));
        //
        //     -- LIMIT ORDERS --
        //     {
        //       "id": 2075345,
        //       "datetime": "2020-05-15T15:58:08.890Z",
        //       "timestamp": 1589558288890,
        //       "status": "Canceled",
        //       "symbol": "MTLBTC",
        //       "type": "limit",
        //       "side": "sell",
        //       "price": "10", // will only be present for limit orders
        //       "amount": "1",
        //       "filled": "0",
        //       "remaining": "1",
        //       "cost": "0"
        //    }
        //    -- MARKET ORDERS --
        //    {
        //       "id": 1495144,
        //       "datetime": "2020-04-21T16:11:29.504Z",
        //       "timestamp": 1587485489504,
        //       "status": "FullyExecuted",
        //       "symbol": "MTL/BTC",
        //       "type": "market",
        //       "side": "buy",
        //       "price": "0",
        //       "amount": "100",
        //       "filled": "100",
        //       "remaining": "0",
        //       "cost": "0"
        //    }
        return this.parseOrder (response);
    }

    async parseOrder (order, market = undefined) {
        const status = this.parseOrderStatus (this.safeString (order, 'status'));
        const timestamp = this.parse8601 (this.safeString (order, 'timestamp'));
        let symbol = undefined;
        const marketId = this.safeString (order, 'symbol');
        if (marketId in this.markets_by_id) {
            market = this.markets_by_id[marketId];
        }
        if (market !== undefined) {
            symbol = market['symbol'];
        }
        let price = this.safeFloat (order, 'price');
        const remaining = this.safeFloat (order, 'remaining');
        const amount = this.safeFloat (order, 'origQty');
        const filled = this.safeFloat (order, 'executedQty');
        const cost = this.safeString (order, 'cost');
        const id = this.safeString (order, 'id');
        let type = this.safeString (order, 'type');
        if (type !== undefined) {
            type = type.toLowerCase ();
            if (type === 'market') {
                if (price === 0.0) {
                    if ((cost !== undefined) && (filled !== undefined)) {
                        if ((cost > 0) && (filled > 0)) {
                            price = cost / filled;
                        }
                    }
                }
            }
        }
        const side = this.safeStringLower (order, 'side');
        const clientOrderId = id;
        // TODO: Need to get average price
        const average = this.safeFloat (order, 'avgPrice');
        return {
            'info': order,
            'id': id,
            'clientOrderId': clientOrderId,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'lastTradeTimestamp': undefined,
            'symbol': symbol,
            'type': type,
            'side': side,
            'price': price,
            'amount': amount,
            'cost': cost,
            'average': average,
            'filled': filled,
            'remaining': remaining,
            'status': status,
            'fee': undefined,
            'trades': undefined,
        };
    }

    async fetchOrder (id, symbol = undefined, params = {}) {
        if (id === undefined) {
            throw new ArgumentsRequired (this.id + ' fetchOrder() requires an order id');
        }
        await this.loadMarkets ();
        const request = {
            'orderId': id,
        };
        const response = await this.privateGetOrdersOrderId (this.extend (request, params));
        //   {
        //       "id": 1495144,
        //       "datetime": "2020-04-21T16:11:29.504Z",
        //       "timestamp": 1587485489504,
        //       "status": "FullyExecuted",
        //       "symbol": "MTL/BTC",
        //       "type": "market",
        //       "side": "buy",
        //       "price": "0",
        //       "amount": "100",
        //       "filled": "100",
        //       "remaining": "0",
        //       "cost": "0"
        // }
        return this.parseOrder (response);
    }

    async fetchOpenOrders (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        const request = {
            'status': 'open',
        };
        const response = await this.privateGetOrders (this.extend (request, params));
        return this.parseOrders (response);
    }

    async fetchOrders (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        const request = {
            'status': 'all',
        };
        const response = await this.privateGetOrders (this.extend (request, params));
        return this.parseOrders (response);
    }

    async fetchMyTrades (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        const request = {};
        let market = undefined;
        if (symbol !== undefined) {
            await this.loadMarkets ();
            market = this.market (symbol);
            request['symbol'] = market['id'];
        }
        if (since !== undefined) {
            request['startTime'] = since;
        }
        if (limit !== undefined) {
            request['limit'] = limit; // Max is 200
        }
        const response = await this.privateGetTradesMe (this.extend (request, params));
        return this.parseTrades (response, market, since, limit);
    }

    async fetchDepositAddress (code, params = {}) {
        if (code === undefined) {
            throw new ArgumentsRequired (this.id + ' fetchDepositAddress() requires a currency code');
        }
        await this.loadMarkets ();
        const currency = this.currency (code);
        const request = {
            'currency': currency['id'],
        };
        const response = await this.privateGetAddressDeposit (this.extend (request, params));
        // {
        //   "currency": "XRP",
        //   "address": "r3e95RwVsLH7yCbnMfyh7SA8FdwUJCB4S2?memo=210833370",
        //   "tag": "210833370" // only for select currencies
        // }
        const address = this.safeString (response, 'address');
        const tag = this.safeString (response, 'tag');
        this.checkAddress (address);
        return {
            'currency': code,
            'address': this.checkAddress (address),
            'tag': tag,
            'info': response,
        };
    }

    async fetchDeposits (code = undefined, since = undefined, limit = undefined, params = {}) {
        //  [
        //    {
        //      "id": 9,
        //      "txid": "7a91c5b321ed7f75d985c6374561e0a8de6f8ef1fa9093437e81805b0759afa8",
        //      "timestamp": 1585236999069,
        //      "datetime": "2020-03-26T15:36:39.069Z",
        //      "addressTo": "bnb1j5jqey3xvs2w43x8540sd8nzykg4pyl4cvkl6x",
        //      "address": "bnb1j5jqey3xvs2w43x8540sd8nzykg4pyl4cvkl6x",
        //      "type": "deposit",
        //      "amount": 0.1,
        //      "currency": "BNB",
        //      "status": "FullyProcessed"
        //    },
        const request = {};
        await this.loadMarkets ();
        let currency = undefined;
        if (code !== undefined) {
            currency = this.currency (code);
            request['currency'] = currency;
        }
        // No limit or since filter
        const response = await this.privateGetDeposits (this.extend (request, params));
        return this.parseTransactions (response, currency, since, limit);
    }

    async fetchWithdrawals (code = undefined, since = undefined, limit = undefined, params = {}) {
        await this.loadMarkets ();
        const request = {};
        let currency = undefined;
        if (code !== undefined) {
            currency = this.currency (code);
            request['currency'] = currency;
        }
        // No limit or since filter
        const response = await this.privateGetWithdrawals (this.extend (request, params));
        return this.parseTransactions (response, currency, since, limit);
    }

    async parseTransaction (transaction, currency = undefined) {
        // -- DEPOSIT --
        // {
        // "id": 9,
        // "txid": "7a91c5b321ed7f75d985c6374561e0a8de6f8ef1fa9093437e81805b0759afa8",
        // "timestamp": 1585236999069,
        // "datetime": "2020-03-26T15:36:39.069Z",
        // "addressTo": "bnb1j5jqey3xvs2w43x8540sd8nzykg4pyl4cvkl6x",
        // "address": "bnb1j5jqey3xvs2w43x8540sd8nzykg4pyl4cvkl6x",
        // "tag": "433519032", // only for some currencies
        // "type": "deposit",
        // "amount": 0.1,
        // "currency": "BNB",
        // "status": "FullyProcessed"
        // },
        //
        // -- WITHDRAW --
        // {
        // "id": 35,
        // "txid": null,
        // "timestamp": 1588588996163,
        // "datetime": "2020-05-04T10:43:16.163Z",
        // "addressTo": "1Lku3CjJueSvuaexy3WQJAR9GL2q4rHV46",
        // "address": "1Lku3CjJueSvuaexy3WQJAR9GL2q4rHV46",
        // "type": "withdraw",
        // "amount": 1,
        // "currency": "BTC",
        // "status": "Pending2Fa",
        // "updated": 1588588996163,
        // "fee": {
        //       "currency": "BTC",
        //       "cost": 0.0001
        // }
        // },
        const id = this.safeString (transaction, 'id');
        const address = this.safeString (transaction, 'address');
        const tag = this.safeString (transaction, 'tag');
        const txid = this.safeValue (transaction, 'txid');
        const currencyId = this.safeString (transaction, 'currency');
        const code = this.safeCurrencyCode (currencyId);
        const timestamp = this.parse8601 (this.safeValue (transaction, 'timestamp'));
        const status = this.safeString (transaction, 'status');
        const type = this.safeString (transaction, 'type');
        const amount = this.safeFloat (transaction, 'amount');
        const fee = this.safeValue (transaction, 'fee');
        return {
            'info': transaction,
            'id': id,
            'txid': txid,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'address': address,
            'tag': tag,
            'type': type,
            'amount': amount,
            'currency': code,
            'status': status,
            'updated': undefined,
            'fee': fee,
        };
    }

    async withdraw (code, amount, address, tag = undefined, params = {}) {
        this.checkAddress (address);
        await this.loadMarkets ();
        const currency = this.currency (code);
        const request = {
            'currency': currency['id'],
            'amount': parseFloat (amount),
        };
        if (tag !== undefined) {
            address += '?dt=' + tag.toString ();
        }
        request['address'] = address;
        const response = await this.privatePostWithdraw (this.extend (request, params));
        return {
            'info': response,
            'id': this.safeString (response, 'id'),
        };
    }

    async fetchTicker (symbol, params = {}) {
        await this.loadMarkets ();
        const market = this.market (symbol);
        const request = {
            'symbol': market['id'], // i.e. MTLBTC
        };
        const response = await this.publicGetTickers (this.extend (request, params));
        return this.parseTicker (response, market);
    }

    async fetchTickers (symbols = undefined, params = {}) {
        await this.loadMarkets ();
        const response = await this.publicGetTickers (params);
        return this.parseTickers (response, symbols);
    }

    parseTickers (rawTickers, symbols = undefined) {
        const tickers = [];
        for (let i = 0; i < rawTickers.length; i++) {
            tickers.push (this.parseTicker (rawTickers[i]));
        }
        return this.filterByArray (tickers, 'symbol', symbols);
    }

    parseTicker (ticker, market = undefined) {
        // {
        //   "symbol": "MTLBTC",
        //   "bidPrice": "0.00002931",
        //   "askPrice": "0.00002946",
        //   "lastPrice": "0.00002946",
        //   "openPrice": "0.00003047",
        //   "highPrice": "0.00003149",
        //   "lowPrice": "0.00002842",
        //   "volume": "2085.6791445"
        // },
        let symbol = undefined;
        const marketId = this.safeString (ticker, 'symbol');
        if (marketId in this.markets_by_id) {
            market = this.markets_by_id[marketId];
        }
        if (market !== undefined) {
            symbol = market['symbol'];
        }
        const last = this.safeFloat (ticker, 'lastPrice');
        return {
            'symbol': symbol,
            'timestamp': undefined,
            'datetime': undefined,
            'high': this.safeFloat (ticker, 'highPrice'),
            'low': this.safeFloat (ticker, 'lowPrice'),
            'bid': this.safeFloat (ticker, 'bidPrice'),
            'bidVolume': undefined,
            'ask': this.safeFloat (ticker, 'askPrice'),
            'askVolume': undefined,
            'vwap': undefined,
            'open': this.safeFloat (ticker, 'openPrice'),
            'close': last,
            'last': last,
            'previousClose': undefined, // previous day close
            'change': undefined,
            'percentage': undefined,
            'average': undefined,
            'baseVolume': this.safeFloat (ticker, 'volume'),
            'quoteVolume': undefined,
            'info': ticker,
        };
    }

    nonce () {
        return this.milliseconds ();
    }

    sign (path, api = 'public', method = 'GET', params = {}, headers = undefined, body = undefined) {
        let fullPath = '/' + this.version + '/' + this.implodeParams (path, params);
        const query = this.omit (params, this.extractParams (path));
        if (method === 'GET') {
            if (Object.keys (query).length) {
                fullPath += '?' + this.urlencode (query);
            }
        }
        const url = this.urls['api'] + fullPath;
        if (api === 'private') {
            this.checkRequiredCredentials ();
            if (method !== 'GET') {
                if (Object.keys (query).length) {
                    body = this.json (query);
                }
            }
            const nonce = this.nonce ();
            const apiKey = this.apiKey;
            const user = this.uid;
            const auth = nonce + apiKey + user;
            const signature = this.hmac (this.encode (auth), this.encode (this.secret), 'sha256');
            headers = {
                'MX-API-KEY': apiKey,
                'MX-API-USER': user,
                'MX-SIGNATURE': signature,
                'MX-NONCE': nonce,
            };
        }
        return { 'url': url, 'method': method, 'body': body, 'headers': headers };
    }
};
