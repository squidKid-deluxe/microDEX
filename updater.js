// ============================================================
// microDEX — Client-only data layer
// Replaces the old Python metaNODE + serve_metanode pipeline
// with a browser-native GrapheneRPCPool.
// ============================================================

/* ------------------------------------------------------------------ */
/*  0b. Diagnostic debug panel                                        */
/* ------------------------------------------------------------------ */
const debugToggle = document.getElementById('debug-toggle');
const debugPanel  = document.getElementById('debug-panel');
const debugLines  = [];
const MAX_DEBUG   = 80;

if (debugToggle) {
    debugToggle.addEventListener('click', () => {
        debugPanel.classList.toggle('visible');
    });
}

function dlog(cls, msg) {
    const line = { cls, msg, t: new Date().toLocaleTimeString() };
    debugLines.push(line);
    if (debugLines.length > MAX_DEBUG) debugLines.shift();
    if (debugPanel && debugPanel.classList.contains('visible')) {
        renderDebug();
    }
}

function renderDebug() {
    if (!debugPanel) return;
    debugPanel.innerHTML = debugLines.map(l =>
        '<span class="' + l.cls + '">[' + l.t + ']</span> ' +
        '<span class="' + l.cls + '">' + esc(l.msg) + '</span>'
    ).join('\n') + '\n';
    debugPanel.scrollTop = debugPanel.scrollHeight;
}

function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

/* ------------------------------------------------------------------ */
/*  0a. Smart number formatting — strip trailing zeros, keep at least */
/*      one decimal so 1.000000 → "1.0" but 1.619374 → "1.619374"     */
/* ------------------------------------------------------------------ */
function fmt(n, decimals) {
    if (decimals === undefined) decimals = 6;
    if (n == null || isNaN(n)) return '--';
    const s = Number(n).toFixed(decimals);
    const stripped = parseFloat(s).toString();
    return stripped.indexOf('.') >= 0 ? stripped : stripped + '.0';
}

/* ------------------------------------------------------------------ */
/*  0.  Default configuration (matches the old metaNODE.py defaults)  */
/* ------------------------------------------------------------------ */
const DEFAULTS = {
    account:  'fast-bot',
    currency: 'XBTSX.USDT',
    asset:    'BTS'
};

const STORAGE_KEY = 'microdex_settings';

/* ------------------------------------------------------------------ */
/*  1.  Global state (read by signing.js, callbacks.js)               */
/* ------------------------------------------------------------------ */
var metaNode = {};          // populated by the poll loop
var pool       = null;      // GrapheneRPCPool instance
var cache      = {};        // resolved IDs / precisions
var polling    = false;     // poll-loop guard

/* ------------------------------------------------------------------ */
/*  2.  Settings UI                                                   */
/* ------------------------------------------------------------------ */
const settingsBtn     = document.getElementById('settings-btn');
const settingsPanel   = document.getElementById('settings-panel');
const cfgAccount      = document.getElementById('cfg_account');
const cfgCurrency     = document.getElementById('cfg_currency');
const cfgAsset        = document.getElementById('cfg_asset');
const cfgSave         = document.getElementById('cfg_save');
const cfgClose        = document.getElementById('cfg_close');
const cfgSync         = document.getElementById('cfg_sync');
const poolStatus      = document.getElementById('pool-status');

// Load saved settings or use defaults
function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (saved) return { ...DEFAULTS, ...saved };
    } catch (_) {}
    return { ...DEFAULTS };
}

function saveSettings(s) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

function updateSettingsButton(hasUserSaved) {
    if (hasUserSaved) {
        settingsBtn.classList.remove('unconfigured');
        settingsBtn.classList.add('configured');
    } else {
        settingsBtn.classList.remove('configured');
        settingsBtn.classList.add('unconfigured');
    }
}

function fillSettingsForm(s) {
    cfgAccount.value  = s.account;
    cfgCurrency.value = s.currency;
    cfgAsset.value    = s.asset;
}

function readSettingsForm() {
    return {
        account:  cfgAccount.value.trim()  || DEFAULTS.account,
        currency: cfgCurrency.value.trim().toUpperCase() || DEFAULTS.currency,
        asset:    cfgAsset.value.trim().toUpperCase()    || DEFAULTS.asset
    };
}

settingsBtn.addEventListener('click', () => {
    const visible = settingsPanel.classList.toggle('visible');
    if (visible) fillSettingsForm(loadSettings());
});

cfgClose.addEventListener('click', () => {
    settingsPanel.classList.remove('visible');
});

// Close panels when clicking outside
document.addEventListener('click', (e) => {
    const inSettings = settingsPanel.contains(e.target) || settingsBtn.contains(e.target);
    const inDebug    = debugPanel.contains(e.target)  || debugToggle.contains(e.target);
    if (!inSettings) settingsPanel.classList.remove('visible');
    if (!inDebug)    debugPanel.classList.remove('visible');
});

cfgSave.addEventListener('click', async () => {
    const s = readSettingsForm();
    saveSettings(s);
    updateSettingsButton(true);
    settingsPanel.classList.remove('visible');
    poolStatus.className = 'yellow';
    poolStatus.textContent = 'Reconnecting with new settings...';
    await bootstrap(s);
});

/* ------------------------------------------------------------------ */
/*  2b. Extension provider integration                                */
/* ------------------------------------------------------------------ */
var extensionProvider = null;
var extensionReady = false;

async function initExtension() {
    return new Promise((resolve) => {
        if (window.bitsharesWallet) {
            extensionProvider = window.bitsharesWallet;
            extensionReady = true;
            resolve(extensionProvider);
        } else {
            window.addEventListener('bitsharesWalletReady', (e) => {
                extensionProvider = e.detail.provider;
                extensionReady = true;
                resolve(extensionProvider);
            }, { once: true });
            setTimeout(() => {
                if (!extensionReady) {
                    console.warn('BitShares Wallet extension not detected');
                    updateWalletStatus('Extension not installed', 'red');
                    resolve(null);
                }
            }, 5000);
        }
    });
}

cfgSync.addEventListener('click', async () => {
    const prov = extensionProvider || window.bitsharesWallet || window.bitshares;
    if (!prov) {
        alert('BitShares Wallet extension not detected. Please install it and reload.');
        return;
    }

    try {
        const result = await prov.connect();
        if (!result.account || !result.account.name) {
            throw new Error('No account connected or wallet locked');
        }

        cfgAccount.value = result.account.name;
        metaNode.account_name = result.account.name;

        dlog('ok', 'Account synced from extension: ' + result.account.name);
    } catch (err) {
        alert('Sync failed: ' + err.message);
    }
});

function updateWalletStatus(text, color) {
    const el = document.getElementById('wallet-status');
    if (!el) return;
    el.textContent = text;
    el.className = color;
}

// Listen for wallet events from the extension
window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    if (e.data?.type !== 'BITSHARES_WALLET_EVENT') return;

    const { event, data } = e.data;
    if (event === 'accountChanged' && data) {
        metaNode.account_name = data.name;
        metaNode.account_id = data.id;
        updateWalletStatus('Connected: ' + data.name, 'green');
        dlog('info', 'Account changed to: ' + data.name);
    } else if (event === 'locked') {
        updateWalletStatus('Wallet locked', 'yellow');
        dlog('warn', 'Wallet locked');
    } else if (event === 'unlocked') {
        updateWalletStatus('Wallet unlocked', 'green');
        dlog('ok', 'Wallet unlocked');
    }
});

/* ------------------------------------------------------------------ */
/*  3.  Bootstrap: resolve cache from pool                            */
/* ------------------------------------------------------------------ */
async function bootstrap(settings) {
    cache.account_name  = settings.account;
    cache.currency      = settings.currency;
    cache.asset         = settings.asset;

    poolStatus.className = 'yellow';
    poolStatus.textContent = 'Resolving account & asset IDs...';
    dlog('info', 'Bootstrap: account=' + settings.account + ' currency=' + settings.currency + ' asset=' + settings.asset);

    try {
        // Resolve asset symbols → ids + precisions
        dlog('info', 'Calling rpcLookupAssetSymbols...');
        const symbols = await pool.rpcLookupAssetSymbols(cache);
        dlog('ok', 'Asset symbols: ' + JSON.stringify(symbols));

        // rpcLookupAssetSymbols returns flat array: [id, precision, id, precision]
        cache.asset_id          = symbols[0];
        cache.asset_precision   = symbols[1];
        cache.currency_id       = symbols[2];
        cache.currency_precision= symbols[3];

        // Resolve account name → account id
        dlog('info', 'Calling rpcLookupAccounts...');
        cache.account_id = await pool.rpcLookupAccounts(cache);
        dlog('ok', 'Account ID: ' + cache.account_id);

        // Populate metaNode skeleton so DOM functions don't crash
        metaNode.account_name   = cache.account_name;
        metaNode.account_id     = cache.account_id;
        metaNode.asset          = cache.asset;
        metaNode.asset_id       = cache.asset_id;
        metaNode.asset_precision= cache.asset_precision;
        metaNode.currency       = cache.currency;
        metaNode.currency_id    = cache.currency_id;
        metaNode.currency_precision = cache.currency_precision;
        metaNode.pair           = cache.asset + ':' + cache.currency;
        metaNode.book           = { bidp: [], bidv: [], askp: [], askv: [] };
        metaNode.history        = [];
        metaNode.orders         = [];
        metaNode.ping           = 0;
        metaNode.blocktime      = 0;
        metaNode.last           = 0;
        metaNode.bts_balance    = 0;
        metaNode.asset_balance  = 0;
        metaNode.currency_balance = 0;
        metaNode.buy_orders     = 0;
        metaNode.sell_orders    = 0;
        metaNode.currency_holding = 0;
        metaNode.asset_holding  = 0;
        metaNode.currency_max   = 0;
        metaNode.asset_max      = 0;
        metaNode.invested       = 0;
        metaNode.divested       = 0;
        metaNode.whitelist      = pool.nodes.slice();
        metaNode.file_read      = 0;

        poolStatus.className = 'green';
        poolStatus.textContent = 'Connected — starting data poll...';

        if (!polling) {
            polling = true;
            pollLoop();
        }

    } catch (e) {
        poolStatus.className = 'red';
        poolStatus.textContent = 'Bootstrap failed: ' + e.message;
        console.error('Bootstrap error:', e);
    }
}

/* ------------------------------------------------------------------ */
/*  4.  Poll loop — gathers all data and updates metaNode             */
/* ------------------------------------------------------------------ */
const POLL_INTERVAL = 2500;   // ms between full polls

async function pollLoop() {
    while (true) {
        await tick();
        await sleep(POLL_INTERVAL);
    }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function tick() {
    try {
        // Guard: skip if cache IDs haven't been resolved yet (bootstrap incomplete or failed)
        if (!cache.asset_id || !cache.currency_id || !cache.account_id) {
            dlog('warn', 'Tick skipped — cache IDs not resolved: ' + JSON.stringify({
                asset_id: cache.asset_id,
                currency_id: cache.currency_id,
                account_id: cache.account_id
            }));
            return;
        }

        const now  = Math.floor(Date.now() / 1000);
        const then = now - 3 * 86400;   // 3 days of history
        const toIso = (ts) => new Date(ts * 1000).toISOString().replace('.000Z', '');

        // -- block latency / ping --
        let ping = metaNode.ping || 0.5;
        let blocktime = now;
        try {
            const bl = await pool.rpcBlockLatency({ mean_ping: ping });
            blocktime = bl[2];
            ping = Math.min(1, (19 * ping + bl[0]) / 20);
            dlog('ok', 'Ping: ' + bl[0].toFixed(3) + 's  Block: ' + blocktime);
        } catch (e) { dlog('warn', 'Block latency failed: ' + e.message); }

        // -- last price --
        let last = metaNode.last || 0;
        try {
            last = parseFloat(await pool.rpcLast(cache));
            dlog('ok', 'Last price: ' + last);
        } catch (e) { dlog('warn', 'rpcLast failed: ' + e.message); }

        // -- order book --
        let book = metaNode.book;
        try {
            const [askp, bidp, askv, bidv] = await pool.rpcBook(cache);
            book = {
                askp: askp.map(parseFloat),
                bidp: bidp.map(parseFloat),
                askv: askv.map(parseFloat),
                bidv: bidv.map(parseFloat)
            };
            dlog('ok', 'Book: ' + bidp.length + ' bids, ' + askp.length + ' asks');
        } catch (e) { dlog('warn', 'rpcBook failed: ' + e.message); }

        // -- trade history --
        let history = metaNode.history;
        try {
            history = await pool.rpcMarketHistory(cache, toIso(now), toIso(then));
            dlog('ok', 'History: ' + history.length + ' entries');
        } catch (e) { dlog('warn', 'rpcMarketHistory failed: ' + e.message); }

        // -- open orders --
        let orders = metaNode.orders;
        try {
            orders = await pool.rpcOpenOrders(cache);
            dlog('ok', 'Open orders: ' + orders.length);
        } catch (e) { dlog('warn', 'rpcOpenOrders failed: ' + e.message); }

        // -- balances --
        let bts_balance = metaNode.bts_balance || 0;
        let asset_balance = metaNode.asset_balance || 0;
        let currency_balance = metaNode.currency_balance || 0;
        try {
            const ids  = [cache.asset_id, cache.currency_id];
            const precs = [cache.asset_precision, cache.currency_precision];
            const bals = await pool.rpcAccountBalances(cache, ids, precs);
            bts_balance    = bals['1.3.0']    || 0;
            asset_balance  = bals[cache.asset_id]  || 0;
            currency_balance = bals[cache.currency_id] || 0;
            dlog('ok', 'Balances: BTS=' + bts_balance.toFixed(2) + ' ' + cache.asset + '=' + asset_balance);
        } catch (e) { dlog('warn', 'rpcAccountBalances failed: ' + e.message); }

        // -- computed fields (same logic as metaNODE.py bifurcation) --
        let buy_orders = 0, sell_orders = 0;
        for (const o of orders) {
            if (o.orderType === 'buy')  buy_orders  += parseFloat(o.amount) * parseFloat(o.price);
            if (o.orderType === 'sell') sell_orders += parseFloat(o.amount);
        }
        buy_orders  = parseFloat(buy_orders.toFixed(cache.currency_precision));
        sell_orders = parseFloat(sell_orders.toFixed(cache.asset_precision));

        const currency_holding = currency_balance + buy_orders;
        const asset_holding    = asset_balance  + sell_orders;
        const currency_max     = currency_holding + asset_holding * last;
        const asset_max        = currency_max / (last || 1);
        const invested         = last ? 100 * asset_holding / asset_max : 0;
        const divested         = 100 - invested;

        // -- write global metaNode --
        metaNode.ping            = ping;
        metaNode.blocktime       = blocktime;
        metaNode.last            = last;
        metaNode.book            = book;
        metaNode.history         = history;
        metaNode.orders          = orders;
        metaNode.bts_balance     = bts_balance;
        metaNode.asset_balance   = asset_balance;
        metaNode.currency_balance= currency_balance;
        metaNode.buy_orders      = buy_orders;
        metaNode.sell_orders     = sell_orders;
        metaNode.currency_holding= parseFloat(currency_holding.toFixed(cache.currency_precision));
        metaNode.asset_holding   = parseFloat(asset_holding.toFixed(cache.asset_precision));
        metaNode.currency_max    = parseFloat(currency_max.toFixed(cache.currency_precision));
        metaNode.asset_max       = parseFloat(asset_max.toFixed(cache.asset_precision));
        metaNode.invested        = parseFloat(invested.toFixed(1));
        metaNode.divested        = parseFloat(divested.toFixed(1));
        metaNode.file_read       = 0;

        // -- pool status line --
        try {
            const st = pool.getNodeStatus();
            const h  = st.health || {};
            const lat = st.connected && pool.activeInstance
                ? pool.activeInstance.pingLatency : 0;
            poolStatus.className = 'green';
            poolStatus.textContent = 'Node: ' + cleanNode(st.currentNodeUrl)
                + '  |  Retry: ' + (h.consecutiveFailures || 0);
        } catch (_) {}

    } catch (e) {
        console.error('poll tick error:', e);
    }
}

function cleanNode(url) {
    return url.replace('wss://', '').replace('/wss', '').replace('/ws', '')
              .split('/')[0].split(':')[0];
}

/* ------------------------------------------------------------------ */
/*  5.  DOM updaters (adapted from original updater.js)               */
/* ------------------------------------------------------------------ */
const nodeSpan = document.getElementById('node-scroll');

const clockSpan  = document.getElementById('blocktime');
const latencySpan= document.getElementById('latency');

const buyOrders    = document.getElementById('buyOrders');
const sellOrders   = document.getElementById('sellOrders');
const openOrders   = document.getElementById('openOrders');
const fillOrders   = document.getElementById('fillOrders');

const balAssets    = document.getElementById('bal-assets');
const balCurrency  = document.getElementById('bal-currency');
const balBts       = document.getElementById('bal-bts');
const balBuyOrders = document.getElementById('bal-buy-orders');
const balSellOrders= document.getElementById('bal-sell-orders');
const balMax       = document.getElementById('bal-max');

const lblAssets    = document.getElementById('lbl-assets');
const lblCurrency  = document.getElementById('lbl-currency');
const lblBts       = document.getElementById('lbl-bts');
const lblBuy       = document.getElementById('lbl-buy');
const lblSell      = document.getElementById('lbl-sell');

// --- Scrolling node list — seamless infinite loop ---
let halfWidth = 0;
let scrollOffset = 0;

function updateNodeScroll() {
    const urls = pool ? pool.nodes.slice(0, 15) : [];
    const cleaned = urls.map(cleanNode);
    const base = cleaned.join(' \u2022 ') + ' \u2022 ';

    // Build enough repeats to be wider than the viewport
    const span = document.createElement('span');
    span.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;';
    span.textContent = base;
    document.body.appendChild(span);
    const unitWidth = span.scrollWidth;
    document.body.removeChild(span);

    const repeats = Math.ceil(window.innerWidth / Math.max(unitWidth, 1)) + 2;
    const half = base.repeat(repeats);
    nodeSpan.textContent = half + half;  // two identical halves
    halfWidth = nodeSpan.scrollWidth / 2;
    scrollOffset = 0;

    requestAnimationFrame(animateScroll);
}

function animateScroll() {
    scrollOffset -= 1.5;
    if (scrollOffset < -halfWidth) scrollOffset = 0;  // seamless reset
    nodeSpan.style.transform = 'translateX(' + scrollOffset + 'px)';
    requestAnimationFrame(animateScroll);
}

// --- Clock & latency ---
function clock() {
    if (metaNode.ping) {
        clockSpan.innerHTML = 'Blocktime: ' + new Date(metaNode.blocktime * 1000).toLocaleString();
        latencySpan.innerHTML = (
            'PING ' + fmt(metaNode.ping, 2) +
            ' \u2022 LATENCY ' + fmt(Math.max(0, (Date.now()/1000) - metaNode.blocktime), 2)
        );
    }
}

// --- Order tables ---
function updateOrders() {
    if (metaNode.ping) {
        // Build HTML strings first, assign innerHTML once per table (avoids 100+ reflows)
        let html = '<tr><td>Cumulative</td><td>Volume</td><td>Price</td></tr>';
        let cum = 0;
        for (let i = 0; i < metaNode.book.bidp.length; i++) {
            cum += metaNode.book.bidv[i];
            html += '<tr><td>' + fmt(cum) + '</td>'
                + '<td>' + fmt(metaNode.book.bidv[i]) + '</td>'
                + '<td>' + fmt(metaNode.book.bidp[i], 8) + '</td></tr>';
        }
        buyOrders.innerHTML = html;

        html = '<tr><td>Price</td><td>Volume</td><td>Cumulative</td></tr>';
        cum = 0;
        for (let i = 0; i < metaNode.book.askp.length; i++) {
            cum += metaNode.book.askv[i];
            html += '<tr><td>' + fmt(metaNode.book.askp[i], 8) + '</td>'
                + '<td>' + fmt(metaNode.book.askv[i]) + '</td>'
                + '<td>' + fmt(cum) + '</td></tr>';
        }
        sellOrders.innerHTML = html;

        html = '<tr><td>Type</td><td>Price</td><td>Volume</td></tr>';
        for (let i = 0; i < metaNode.orders.length; i++) {
            const o = metaNode.orders[i];
            html += '<tr><td>' + o.orderType + '</td>'
                + '<td>' + fmt(o.price, 8) + '</td>'
                + '<td>' + fmt(o.amount) + '</td></tr>';
        }
        openOrders.innerHTML = html;

        html = '<tr><td>Time</td><td>Price</td><td>Volume</td></tr>';
        for (let i = 0; i < metaNode.history.length; i++) {
            const h = metaNode.history[i];
            html += '<tr><td>' + new Date(h[0] * 1000).toLocaleString() + '</td>'
                + '<td>' + fmt(h[1], 8) + '</td>'
                + '<td>' + fmt(h[2]) + '</td></tr>';
        }
        fillOrders.innerHTML = html;

        // Balance labels
        if (lblAssets)    lblAssets.textContent    = cache.asset || 'ASSETS';
        if (lblCurrency)  lblCurrency.textContent  = cache.currency || 'CURRENCY';
        if (lblBts)       lblBts.textContent       = 'BTS';
        if (lblBuy)       lblBuy.textContent       = 'BUY';
        if (lblSell)      lblSell.textContent      = 'SELL';

        // Balance display
        balAssets.textContent    = fmt(metaNode.asset_balance, cache.asset_precision || 5);
        balCurrency.textContent  = fmt(metaNode.currency_balance, cache.currency_precision || 8);
        balBts.textContent       = fmt(metaNode.bts_balance, 5);
        balBuyOrders.textContent = fmt(metaNode.buy_orders, cache.currency_precision || 8);
        balSellOrders.textContent= fmt(metaNode.sell_orders, cache.asset_precision || 5);
        balMax.textContent       = fmt(metaNode.asset_max, cache.asset_precision || 5);
    }
}

/* ------------------------------------------------------------------ */
/*  6.  Init                                                          */
/* ------------------------------------------------------------------ */
(async function init() {
    dlog('info', 'microDEX client-only init');

    // Initialize extension provider
    await initExtension();
    if (extensionProvider) {
        setProvider(extensionProvider);
        dlog('ok', 'Extension provider ready');
        // Try to auto-connect and sync account
        try {
            const result = await extensionProvider.connect();
            if (result.account && result.account.name) {
                metaNode.account_name = result.account.name;
                updateWalletStatus('Connected: ' + result.account.name, 'green');
            }
        } catch (e) {
            dlog('warn', 'Auto-connect failed: ' + e.message);
        }
    } else {
        dlog('warn', 'No extension provider found – trading will not work');
        updateWalletStatus('Extension required', 'red');
    }

    // Create pool
    pool = new GrapheneRPCPool({
        maxRetries:      3,
        timeoutMs:       5000,
        failoverDelay:   1000,
        failoverDebounceMs: 8000
    });

    const settings = loadSettings();
    const hasUserSaved = localStorage.getItem(STORAGE_KEY) !== null;
    updateSettingsButton(hasUserSaved);
    fillSettingsForm(settings);
    dlog('info', 'Settings loaded: ' + JSON.stringify(settings) + ' (saved=' + hasUserSaved + ')');

    // Connect pool, then bootstrap
    try {
        poolStatus.textContent = 'Connecting to pool...';
        dlog('info', 'Connecting pool...');
        await pool.getActiveInstance();
        dlog('ok', 'Pool connected. Node: ' + pool.activeInstance.url);
        poolStatus.textContent = 'Connected! Bootstrapping...';
        await bootstrap(settings);
        dlog('ok', 'Bootstrap complete. Starting poll loop.');
        updateNodeScroll();
    } catch (e) {
        poolStatus.className = 'red';
        poolStatus.textContent = 'Pool connection failed: ' + e.message;
        dlog('err', 'Pool connection failed: ' + e.message);
        console.error('Pool connection error:', e);
    }

    // Start DOM updates — single interval avoids competing timers
    setInterval(() => {
        clock();
        updateOrders();
    }, 1000);
})();
