"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deserializeTransaction = exports.transactionParams = void 0;
const o1js_1 = require("o1js");
function transactionParams(serializedTransaction) {
    const { fee, sender, nonce, tx } = JSON.parse(serializedTransaction);
    const transaction = o1js_1.Mina.Transaction.fromJSON(JSON.parse(tx));
    const memo = transaction.transaction.memo;
    return {
        fee: o1js_1.UInt64.fromJSON(fee),
        sender: o1js_1.PublicKey.fromBase58(sender),
        nonce: Number(nonce),
        memo,
    };
}
exports.transactionParams = transactionParams;
function deserializeTransaction(serializedTransaction, txNew) {
    console.log("new transaction", txNew);
    const { tx, blindingValues, length } = JSON.parse(serializedTransaction);
    const transaction = o1js_1.Mina.Transaction.fromJSON(JSON.parse(tx));
    console.log("transaction", transaction);
    if (length !== txNew.transaction.accountUpdates.length) {
        throw new Error("New Transaction length mismatch");
    }
    if (length !== transaction.transaction.accountUpdates.length) {
        throw new Error("Serialized Transaction length mismatch");
    }
    for (let i = 0; i < length; i++) {
        transaction.transaction.accountUpdates[i].lazyAuthorization =
            txNew.transaction.accountUpdates[i].lazyAuthorization;
        if (blindingValues[i] !== "")
            transaction.transaction.accountUpdates[i].lazyAuthorization.blindingValue = o1js_1.Field.fromJSON(blindingValues[i]);
    }
    return transaction;
}
exports.deserializeTransaction = deserializeTransaction;
