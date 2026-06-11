const express = require("express");
const { KiteTicker } = require("kiteconnect");
const WebSocket = require("ws");
const http = require("http");

const app = express();

const server = http.createServer(app);

const wss = new WebSocket.Server({
    server
});

const ticker = new KiteTicker({
    api_key: process.env.KITE_API_KEY,
    access_token: process.env.KITE_ACCESS_TOKEN
});

ticker.connect();

ticker.on("connect", () => {

    console.log("Connected to Kite");

    ticker.subscribe([
        738561,     // RELIANCE
        2953217,    // TCS
        408065      // INFY
    ]);

    ticker.setMode(
        ticker.modeFull,
        [738561,2953217,408065]
    );
});

ticker.on("ticks", (ticks) => {

    const payload = JSON.stringify(ticks);

    wss.clients.forEach(client => {

        if(client.readyState === WebSocket.OPEN){
            client.send(payload);
        }

    });
});

app.get("/", (req,res) => {
    res.send("Algo Agent WebSocket Running");
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Server running on ${PORT}`);
});