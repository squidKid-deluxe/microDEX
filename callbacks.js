async function buy() {
    const priceElem = document.getElementById('buy_price')
    const amtElem = document.getElementById('buy_amt')
    await createOrder(priceElem.value, amtElem.value, 0, "buy");
}

async function sell() {
    const priceElem = document.getElementById('sell_price')
    const amtElem = document.getElementById('sell_amt')
    await createOrder(priceElem.value, amtElem.value, 0, "sell");
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
    const ids = metaNode.orders.map(order => order.orderNumber);
    await cancelOrders(ids);
}
