# microDEX - Minimalist BitShares UI

> A dependency-free, real-time trading interface for the BitShares blockchain - built with vanilla HTML, CSS, and JavaScript. No React. No Vue. No Tailwind. No Python. Just raw data, fast.

![microDEX Screenshot](screenshot.png)

---

## What Is microDEX?

**microDEX** is a lightweight, minimalist web-based trading interface for the [BitShares](https://bitshares.org) blockchain. It connects directly to multiple public BitShares nodes from your browser via WebSocket, streams live order book and fill history data, and lets you trade - all without a backend server.

No frameworks. No bloat. No dependencies. Pure performance.

---

## Features

- Realtime Order Book (Buy & Sell) with cumulative volume
- Live Fill History (recent trades)
- Open Orders Tracker with cancel support
- Buy/Sell Interface with Wallet Lock/Unlock
- Multi-Node Pool with automatic failover (15+ nodes)
- Node Health Monitoring (ping, latency, status)
- Settings UI - configurable trading pair, account, and assets
- Vanilla HTML/CSS/JS - Zero External Libraries (except bitsharesjs for crypto)
- Client-Side Only - No backend, no Python, no server required
- Dark Theme with terminal-style layout

---

## Data Displayed

| Section             | Info Shown                                                                 |
|---------------------|----------------------------------------------------------------------------|
| **Blocktime**       | Current blockchain timestamp                                               |
| **PING / READ / LATENCY** | Network health metrics across connected nodes                            |
| **Order Book**      | Cumulative volume, price, and volume per level (buy/sell)                  |
| **Open Orders**     | Type, Price, Volume of your active orders                                  |
| **Fill Orders**     | Timestamp, Price, Volume of recent fills                                   |
| **Wallet Status**   | Locked/Unlocked state + WIF input field                                    |
| **Trade Controls**  | Buy/Sell price & amount fields + "BUY", "SELL", "CANCEL ALL" buttons       |
| **Settings**        | Trading pair, account name, asset configuration                            |

---

## How It Works

1. **Node Pool**: `graphene-rpc.js` manages a pool of 15+ BitShares nodes with automatic failover and health tracking via WebSocket connections.
2. **Data Polling**: `updater.js` polls the node pool every 2.5 seconds for order book, history, balances, and account data.
3. **Wallet & Trading**: `signing.js` handles WIF key management and transaction signing using `bitsharesjs.min.js` - all client-side.
4. **UI**: Vanilla JS dynamically updates the DOM - no virtual DOM, no reactivity engine.

---

## Quick Start

### Option 1: Open Directly
Simply open `index.html` in your browser. Chrome, Firefox, and Safari all work.

### Option 2: Serve Locally
```bash
python3 -m http.server 8080
```
Then visit `http://localhost:8080/index.html`

> **No installation required.** No `pip install`, no `npm install`, no dependencies to download.

---

## Wallet & Trading

- **WIF Input**: Enter your private key (WIF format) to unlock wallet. This never leaves your browser - all signing happens client-side.
- **Lock/Unlock**: Toggle wallet state safely. Once locked, your WIF is deleted from memory after 5 minutes.
- **Place Orders**: Enter price and amount → Click "BUY" or "SELL".
- **Cancel All**: Cancel all open orders at once.
- **Settings**: Click the settings button to configure trading pair, account name, and assets. Settings are saved in localStorage.
- ⚠️ **Orders take a few seconds to appear - click once, then confirm.**

---

## Nodes in Use

The app connects to these public BitShares API endpoints with automatic failover:

```
wss://api.bts.mobi/wss
wss://api.61bts.com/ws
wss://api.dex.trading/ws
wss://api.btslebin.com/ws
wss://bitsharesapi.loclx.io
wss://cloud.xbts.io/ws
wss://node.xbts.io/wss
wss://public.xbts.io/ws
wss://dex.iobanker.com/ws
wss://eu.nodes.bitshares.ws/ws
wss://btsws.roelandp.nl/ws
wss://api.bitshares.dev/wss
wss://newyork.bitshares.im/wss
wss://asia.nodes.bitshares.ws/wss
wss://bts.open.icowallet.net/ws
```

You can customize this list in `graphene-rpc.js` in the `defaultNodes` array.

---

## Project Structure

```
/workspace/
├── index.html          # Main SPA (Single Page Application)
├── graphene-rpc.js        # WebSocket client + multi-node pool with failover
├── updater.js             # Data polling, settings UI, DOM updates
├── signing.js             # Wallet & transaction operations
├── callbacks.js           # UI event handlers (buy/sell/cancel)
├── bitsharesjs.min.js     # BitShares crypto library (minified)
├── main.css               # Dark theme, terminal-style layout
├── buttons.css            # Button styles (buy/sell/cancel)
├── favicon.png            # Site icon
└── screenshot.png         # UI screenshot
```

---

## Why No Frameworks?

Dependencies. The BitShares reference UI is amazing, but it's tied to React 16 - six major versions out of date. My goal with this project is to create software that depends on basics, without having to keep up with version cycles. Vanilla JavaScript hasn't fundamentally changed for 30 years - *that* is stable.

---

## Contributing

PRs welcome! Much of this app is still up in the air, but feel free to contribute anyway.

---

## License

WTFPL - Do what you want. It's open source, after all.

---

## Credits

- Uses `bitsharesjs` for cryptographic operations and transaction signing
- Inspired by the ethos of minimalism and decentralization
- For the BitShares community - keep building!
