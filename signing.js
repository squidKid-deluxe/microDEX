// TODO: These two need to be more exposed
const END_OF_TIME_ISO = 4 * 10 ** 9;
const KILL_OR_FILL = false;


let _privateKey = null;

const msgElem = document.getElementById('wallet-status');

function showError() {
    msgElem.innerHTML = "WALLET LOCKED";
    msgElem.classList.remove('yellow');
    msgElem.classList.add('red');
    msgElem.classList.add('animate-error');

    // Remove the class after the animation ends
    msgElem.addEventListener('animationend', () => {
        msgElem.classList.remove('animate-error');
        msgElem.classList.add('yellow');
        msgElem.classList.remove('red');
    }, { once: true });
}

async function checkLoggedIn() {
    const tr = new bitshares_js.TransactionBuilder();

    // Add cancel order operation  
    tr.add_type_operation("limit_order_cancel", {
        fee: {
            amount: 0,
            asset_id: "1.3.0"
        },
        fee_paying_account: metaNode.account_id,
        order: "1.7.0"
    });

    await tr.set_required_fees();

    tr.add_signer(_privateKey);

    authenticated = true;
    try {
        await tr.finalize();
        tr.sign();
    } catch (e) {
        console.log(e);
        authenticated = false;
    }

    if (!tr.signed) {
        authenticated = false;
    }

    if (authenticated) {
        // no errors happened, so we must be unlocked
        msgElem.classList.remove('yellow');
        msgElem.classList.add('green');
        msgElem.innerHTML = "WALLET UNLOCKED";
    } else {
        showError();
    }
}

/* SECURITY: this is the only function that ever touches the WIF */
/*           thereafter it's stored as the semi-global _privateKey*/
async function unlock() {
    // if we're unlocked, then lock
    if (_privateKey) {
        _privateKey = null;

        msgElem.classList.remove('animate-error');
        msgElem.classList.add('yellow');
        msgElem.classList.remove('red');
        msgElem.innerHTML = "WALLET LOCKED";
        return;
    }
    msgElem.innerHTML = "UNLOCKING...";

    const inputElement = document.getElementById("wif_input");
    try {
        let wif = inputElement.value.trim(); // use `let` so we can null it

        // Clear input field from DOM
        inputElement.value = '';
        _privateKey = bitshares_js.PrivateKey.fromWif(wif);
        wif = null; // explicit cleanup

        await checkLoggedIn();
    } catch (e) {
        showError();
        console.log(e);
    } finally {
        // Clear input field from DOM
        inputElement.value = '';

        // Clear private key from memory after 5 minutes
        setTimeout(() => {
            _privateKey = null;
            msgElem.classList.remove('animate-error');
            msgElem.classList.add('yellow');
            msgElem.classList.remove('red');
            msgElem.innerHTML = "WALLET LOCKED";
        }, 5 * 60 * 1000);
    }
}

async function wss_handshake(node) {
    await bitshares_js.bitshares_ws.Apis.instance(node, true).init_promise;
}

async function createOrder(price, amount, expiration, op) {
    const tr = new bitshares_js.TransactionBuilder();

    // Convert expiration to ISO8601, or use END_OF_TIME_ISO
    const expirationIso = expiration === 0 ?
        END_OF_TIME_ISO :
        new Date(expiration * 1000).toISOString(); // assuming UNIX timestamp in seconds

    let min_to_receive, amount_to_sell;

    if (op === "buy") {
        // Buying asset with currency
        min_to_receive = {
            amount: Math.floor(amount * 10 ** metaNode.asset_precision),
            asset_id: metaNode.asset_id
        };
        amount_to_sell = {
            amount: Math.floor(amount * price * 10 ** metaNode.currency_precision),
            asset_id: metaNode.currency_id
        };
    } else if (op === "sell") {
        // Selling asset to receive currency
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

    tr.add_type_operation("limit_order_create", {
        fee: {
            amount: 0,
            asset_id: "1.3.0"
        },
        seller: metaNode.account_id,
        fee_paying_account: metaNode.account_id,
        amount_to_sell,
        min_to_receive,
        expiration: expirationIso,
        fill_or_kill: KILL_OR_FILL,
        extensions: []
    });

    await broadcastTransaction(tr, "Buy order");
}

async function cancelOrders(orderIds) {
    const tr = new bitshares_js.TransactionBuilder();

    // Iterate over each orderId and add the cancel order operation
    orderIds.forEach(orderId => {
        // Add cancel order operation
        tr.add_type_operation("limit_order_cancel", {
            fee: {
                amount: 0,
                asset_id: "1.3.0"
            },
            fee_paying_account: metaNode.account_id,
            order: orderId
        });
    });

    await broadcastTransaction(tr, "Cancel order");
}

// Helper function to sign and broadcast transactions  
async function broadcastTransaction(tr, operationType) {
    try {
        // Set required fees  
        await tr.set_required_fees();

        tr.add_signer(_privateKey);

        // Broadcast the transaction  
        const result = await tr.broadcast();
        console.log(`${operationType} broadcast successfully:`, result);
        return result;

    } catch (error) {
        console.error(`Error broadcasting ${operationType}:`, error);
        throw error;
    }
}
