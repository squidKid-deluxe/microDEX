const nodes = [
    "wss://api.bts.mobi/wss",
    "wss://api.61bts.com/ws",
    "wss://api.dex.trading/ws",
    "wss://api.btslebin.com/ws",
    "wss://bitsharesapi.loclx.io",
    "wss://cloud.xbts.io/ws",
    "wss://node.xbts.io/wss",
    "wss://public.xbts.io/ws",
    "wss://dex.iobanker.com/ws",
    "wss://eu.nodes.bitshares.ws/ws",
    "wss://btsws.roelandp.nl/ws",
];

const cleanNode = (url) => {
    return url.replace("wss://", "")
        .replace("/wss", "")
        .replace("/ws", "")
        .split("/")[0]
        .split(":")[0];
};

const cleanedNodes = nodes.map(cleanNode);
const baseScrollText = cleanedNodes.join(" • ") + " • ";
const nodeSpan = document.getElementById("node-scroll");

nodeSpan.textContent = baseScrollText;
let width = nodeSpan.scrollWidth;
nodeSpan.textContent += baseScrollText + baseScrollText;

let offset = 0;

function animateScroll() {
    offset -= 1.5; // Adjust speed as needed
    if (offset < -width) {
        offset = 0;
    }
    nodeSpan.style.transform = `translateX(${offset}px)`;
    requestAnimationFrame(animateScroll);
}

requestAnimationFrame(animateScroll);
