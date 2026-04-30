// signing.js – now uses the extension provider instead of bitsharesjs

// Constants
const END_OF_TIME_ISO = "2096-10-02T07:06:40"; // far‑future timestamp (no ms)
const KILL_OR_FILL = false;

// Provider reference (set by initExtension from updater.js)
let _provider = null;

// Expose to updater.js via global (no ES modules – plain script tag)
function setProvider(p) { _provider = p; }

/**
 * Verify that the extension is connected and that the connected account
 * matches the account configured in microDEX (metaNode.account_name).
 * Throws an error if not, which will be caught by the caller.
 */
async function verifyAccountMatch() {
    if (!_provider) {
        alert('Wallet extension is not connected. Please connect your wallet before signing transactions.');
        throw new Error('Wallet extension not connected');
    }

    let conn;
    try {
        conn = await _provider.checkConnection();
    } catch (e) {
        alert('Could not reach wallet extension: ' + e.message);
        throw new Error('Wallet connection check failed');
    }

    if (!conn || !conn.connected) {
        alert('Wallet is not connected to this site. Please connect using the extension before signing.');
        throw new Error('Wallet not connected');
    }

    // If we have both account names, compare
    if (conn.account && metaNode.account_name && conn.account.name !== metaNode.account_name) {
        alert(
            'Account mismatch! Extension connected to "' + conn.account.name + '", ' +
            'but microDEX is set to "' + metaNode.account_name + '". ' +
            'Use the "Sync from Extension" button in Settings to align them.'
        );
        throw new Error('Account mismatch');
    }
}

/**
 * Build a limit‑order‑create operation and sign/broadcast via extension.
 * Mirrors the old createOrder logic but uses the provider.
 */
async function createOrder(price, amount, expiration, op) {
    // Ensure account matches before proceeding
    await verifyAccountMatch();

    if (!_provider) {
        alert('Wallet extension not connected');
        throw new Error('Wallet extension not connected');
    }

    // Ensure we are connected (extension may require approval)
    try {
        const { connected } = await _provider.checkConnection();
        if (!connected) await _provider.connect();
    } catch (e) {
        alert('Could not connect to wallet. Please make sure your wallet extension is unlocked and authorized this site.');
        throw new Error('Failed to connect wallet: ' + e.message);
    }

    const expirationIso = expiration === 0
        ? END_OF_TIME_ISO
        : new Date(expiration * 1000).toISOString().replace('.000Z', '');

    let min_to_receive, amount_to_sell;

    if (op === "buy") {
        min_to_receive = {
            amount: Math.floor(amount * 10 ** metaNode.asset_precision),
            asset_id: metaNode.asset_id
        };
        amount_to_sell = {
            amount: Math.floor(amount * price * 10 ** metaNode.currency_precision),
            asset_id: metaNode.currency_id
        };
    } else if (op === "sell") {
        min_to_receive = {
            amount: Math.floor(amount * price * 10 ** metaNode.currency_precision),
            asset_id: metaNode.currency_id
        };
        amount_to_sell = {
            amount: Math.floor(amount * 10 ** metaNode.asset_precision),
            asset_id: metaNode.asset_id
        };
    } else {
        throw new Error(`Unknown operation type: ${op}`);
    }

    const operation = {
        fee: { amount: 0, asset_id: "1.3.0" },
        seller: metaNode.account_id,
        amount_to_sell,
        min_to_receive,
        expiration: expirationIso,
        fill_or_kill: KILL_OR_FILL,
        extensions: []
    };

    // Transaction format expected by the extension:
    // { operations: [[opType, opData], ...], extensions: [] }
    const transaction = {
        operations: [[1, operation]], // 1 = limit_order_create
        extensions: []
    };

    try {
        const result = await _provider.signTransaction(transaction);
        console.log('Order broadcast successfully:', result);
        return result;
    } catch (error) {
        console.error('Order failed:', error);
        throw error;
    }
}

/**
 * Cancel one or more orders via extension.
 */
async function cancelOrders(orderIds) {
    // Ensure account matches before proceeding
    await verifyAccountMatch();

    if (!_provider) {
        alert('Wallet extension not connected');
        throw new Error('Wallet extension not connected');
    }

    try {
        const { connected } = await _provider.checkConnection();
        if (!connected) await _provider.connect();
    } catch (e) {
        alert('Could not connect to wallet. Please make sure your wallet extension is unlocked and authorized this site.');
        throw new Error('Failed to connect wallet: ' + e.message);
    }

    const operations = orderIds.map(orderId => [2, { // 2 = limit_order_cancel
        fee: { amount: 0, asset_id: "1.3.0" },
        fee_paying_account: metaNode.account_id,
        order: orderId,
        extensions: []
    }]);

    const transaction = {
        operations,
        extensions: []
    };

    try {
        const result = await _provider.signTransaction(transaction);
        console.log('Cancel broadcast successfully:', result);
        return result;
    } catch (error) {
        console.error('Cancel failed:', error);
        throw error;
    }
}

// NOTE: wss_handshake, unlock, checkLoggedIn, _privateKey are no longer needed.
// The extension handles signing and broadcasting internally.
