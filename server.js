const WebSocket = require('ws');
// const fetch = require('node-fetch'); // не нужен, если только кластер

// Оставляем только один тикер!
const tickers = ["BTCUSDT"];

let marketData = {}; // { symbol: { clusters: [...], lastPrice, heat, tape: [...] } }

function subscribeBinance(symbol) {
    const url = `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@trade`;
    const ws = new WebSocket(url);

    let clusters = [];
    let currentCluster = { ts: Date.now(), priceBins: {}, total: 0, trades: 0 };

    ws.on('message', msg => {
        const data = JSON.parse(msg);
        const price = +data.p;
        const volume = +data.q;
        const bin = Math.round(price / 10) * 10;

        // добавляем в кластер
        if (!currentCluster.priceBins[bin]) currentCluster.priceBins[bin] = 0;
        currentCluster.priceBins[bin] += volume;
        currentCluster.total += volume;
        currentCluster.trades++;

        // кластер = 1 минута
        if (Date.now() - currentCluster.ts > 60 * 1000) {
            clusters.push({
                start: currentCluster.ts,
                bins: currentCluster.priceBins,
                total: currentCluster.total,
                trades: currentCluster.trades,
            });
            if (clusters.length > 20) clusters.shift();
            currentCluster = { ts: Date.now(), priceBins: {}, total: 0, trades: 0 };
        }

        // обновляем данные
        const heat = Math.min(1, currentCluster.total / 50);
        marketData[symbol] = {
            clusters: clusters.slice(-10),
            lastPrice: price,
            heat,
            tape: marketData[symbol]
                ? [{ price, volume, time: new Date().toISOString().substr(11, 8), side: data.m ? "SELL" : "BUY" }, ...marketData[symbol].tape].slice(0, 10)
                : [{ price, volume, time: new Date().toISOString().substr(11, 8), side: data.m ? "SELL" : "BUY" }]
        };
    });

    ws.on('close', () => setTimeout(() => subscribeBinance(symbol), 1000));
    ws.on('error', () => ws.terminate());
}

tickers.forEach(subscribeBinance);

// --- WebSocket сервер для frontend ---
const wss = new WebSocket.Server({ port: 8081 });
console.log('Cluster backend WebSocket running on :8081');

setInterval(() => {
    const json = JSON.stringify(marketData);
    console.log('marketData:', json); // Для отладки
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.send(json);
    });
}, 1500);
