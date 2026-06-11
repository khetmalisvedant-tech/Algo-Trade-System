const express = require("express");
const { KiteTicker } = require("kiteconnect");
const WebSocket = require("ws");

const app = express();

const server = app.listen(3001);

const wss = new WebSocket.Server({ server });

const ticker = new KiteTicker({
  api_key: process.env.KITE_API_KEY,
  access_token: process.env.KITE_ACCESS_TOKEN
});

ticker.connect();

ticker.on("connect", () => {

  ticker.subscribe([
    738561,   // RELIANCE
    2953217,  // TCS
    408065    // INFY
  ]);

  ticker.setMode(
    ticker.modeFull,
    [738561,2953217,408065]
  );
});

ticker.on("ticks", (ticks) => {

  const data = JSON.stringify(ticks);

  wss.clients.forEach(client => {

    if(client.readyState === WebSocket.OPEN)
      client.send(data);

  });
});