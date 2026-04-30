function checkWalletReady() {
    if (typeof _provider === 'undefined' || !_provider) {
        alert('Wallet extension is not detected. Please install a BitShares wallet extension.');
        return false;
    }
    return true;
}

async function buy() {
    if (!checkWalletReady()) return;
    try {
        const priceElem = document.getElementById('buy_price')
        const amtElem = document.getElementById('buy_amt')
        await createOrder(priceElem.value, amtElem.value, 0, "buy");
    } catch (e) {
        console.error('Buy order failed:', e);
        if (!e.message.includes('Wallet') && !e.message.includes('Account mismatch')) {
            alert('Buy order failed: ' + e.message);
        }
    }
}

async function sell() {
    if (!checkWalletReady()) return;
    try {
        const priceElem = document.getElementById('sell_price')
        const amtElem = document.getElementById('sell_amt')
        await createOrder(priceElem.value, amtElem.value, 0, "sell");
    } catch (e) {
        console.error('Sell order failed:', e);
        if (!e.message.includes('Wallet') && !e.message.includes('Account mismatch')) {
            alert('Sell order failed: ' + e.message);
        }
    }
}
/*
metaNode orders list spec:
{
    "orderNumber": order["id"],
    "orderType": order_type,
    "market": cache["pair"],
    "amount": precision(amount, cache["asset_precision"]),
    "price": precision(price, 16),
}
*/
async function cancelAll() {
    if (!checkWalletReady()) return;
    try {
        const ids = metaNode.orders.map(order => order.orderNumber);
        await cancelOrders(ids);
    } catch (e) {
        console.error('Cancel order failed:', e);
        if (!e.message.includes('Wallet') && !e.message.includes('Account mismatch')) {
            alert('Cancel order failed: ' + e.message);
        }
    }
}
