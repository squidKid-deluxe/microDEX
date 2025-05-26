// Create a new WebSocket connection
const socket = new WebSocket('ws://localhost:8128/metaNODE');
socket.onopen = function() {
    console.log('metaNODE connection established');
};
socket.onmessage = handleMetaNode;
socket.onclose = function() {
    console.log('metaNODE connection closed');
};
socket.onerror = function(error) {
    console.error('metaNODE connection error:', error);
};

const nodeSpan = document.getElementById("node-scroll");

var metaNode = {}
var nodesWidth = 0;
let connected = false;

async function handleMetaNode(data) {
    metaNode = JSON.parse(data.data);

    const cleanedNodes = metaNode.whitelist.map(cleanNode);
    const baseScrollText = cleanedNodes.join(" • ") + " • ";

    nodeSpan.textContent = baseScrollText;
    nodesWidth = nodeSpan.scrollWidth;
    for (var i = 0; i < window.innerWidth % nodesWidth; i++) {
        nodeSpan.textContent += baseScrollText;
    }

    if (!connected) {
        try {
            // aka `wss_handshake(random.choice(whitelist))`
            await wss_handshake(metaNode.whitelist[Math.floor(Math.random() * metaNode.whitelist.length)]);
            connected = true;
        } catch (e) {
            console.log(`Failed to connect to bitshares node: ${e}`);
            connected = false;
        }
    }
}

function cleanNode(url) {
    return url.replace("wss://", "")
        .replace("/wss", "")
        .replace("/ws", "")
        .split("/")[0]
        .split(":")[0];
};


let offset = 0;


const clockSpan = document.getElementById("blocktime");
const latencySpan = document.getElementById("latency");

function clock() {
    if (metaNode.ping) {
        clockSpan.innerHTML = "Blocktime: " + new Date(metaNode.blocktime * 1000).toLocaleString();
        latencySpan.innerHTML = (
            `PING ${metaNode.ping.toFixed(2)}` +
            ` • READ ${metaNode.file_read.toFixed(6)}` +
            ` • LATENCY ${((new Date()/1000)-metaNode.blocktime).toFixed(2)}`
        );
    }
    setTimeout(clock, 1000);
}

clock();



const buyOrders = document.getElementById("buyOrders");
const sellOrders = document.getElementById("sellOrders");
const openOrders = document.getElementById("openOrders");
const fillOrders = document.getElementById("fillOrders");

const orderElements = [buyOrders, sellOrders, openOrders, fillOrders];
const orderTypes = ["buy", "sell", "open", "fill"];

function updateOrders() {
    if (metaNode.ping) {
        for (var typedx = 0; typedx < 4; typedx++) {
            let element = orderElements[typedx];
            let type = orderTypes[typedx];
            if (type === "buy") {
                element.innerHTML = `<tr><td>Cumulative</td><td>Volume</td><td>Price</td></tr>`;
                let cumulated = 0;
                for (var i = 0; i < metaNode.book.bidp.length; i++) {
                    cumulated += metaNode.book.bidv[i]
                    element.innerHTML += `<tr><td>${cumulated.toFixed(6)}</td>` +
                        `<td>${metaNode.book.bidv[i].toFixed(6)}</td>` +
                        `<td>${metaNode.book.bidp[i].toFixed(8)}</td></tr>`;
                }
            } else if (type === "sell") {
                element.innerHTML = `<tr><td>Price</td><td>Volume</td><td>Cumulative</td></tr>`;
                let cumulated = 0;
                for (var i = 0; i < metaNode.book.askp.length; i++) {
                    cumulated += metaNode.book.askv[i]
                    element.innerHTML += `<tr><td>${metaNode.book.askp[i].toFixed(8)}</td>` +
                        `<td>${metaNode.book.askv[i].toFixed(6)}</td>` +
                        `<td>${cumulated.toFixed(6)}</td></tr>`;
                }
            } else if (type === "open") {
                "orders"
                element.innerHTML = `<tr><td>Type</td><td>Price</td><td>Volume</td></tr>`;
                for (var i = 0; i < metaNode.orders.length; i++) {
                    element.innerHTML += `<tr><td>${metaNode.orders[i].orderType}</td>` +
                        `<td>${parseFloat(metaNode.orders[i].amount).toFixed(8)}</td>` +
                        `<td>${parseFloat(metaNode.orders[i].price).toFixed(6)}</td></tr>`;
                }
            } else if (type === "fill") {
                element.innerHTML = `<tr><td>Time</td><td>Price</td><td>Volume</td></tr>`;
                for (var i = 0; i < metaNode.history.length; i++) {
                    element.innerHTML += `<tr><td>${new Date(metaNode.history[i][0] * 1000).toLocaleString()}</td>` +
                        `<td>${parseFloat(metaNode.history[i][1]).toFixed(8)}</td>` +
                        `<td>${parseFloat(metaNode.history[i][2]).toFixed(6)}</td></tr>`;
                }
            }
        }
    }
    setTimeout(updateOrders, 1000);
}

updateOrders();

function animateScroll() {
    offset -= 1.5; // Adjust speed as needed
    if (offset < -nodesWidth) {
        offset = 0;
    }
    nodeSpan.style.transform = `translateX(${offset}px)`;
    requestAnimationFrame(animateScroll);
}

requestAnimationFrame(animateScroll);
