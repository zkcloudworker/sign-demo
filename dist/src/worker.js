"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.zkcloudworker = exports.ProveAndSendWorker = void 0;
const zkcloudworker_1 = require("zkcloudworker");
const o1js_1 = require("o1js");
const minanft_1 = require("minanft");
const deserialize_1 = require("./deserialize");
class ProveAndSendWorker extends zkcloudworker_1.zkCloudWorker {
    constructor(cloud) {
        super(cloud);
        this.cache = o1js_1.Cache.FileSystem(this.cloud.cache);
    }
    async deployedContracts() {
        throw new Error("not implemented");
    }
    async compile() {
        try {
            console.time("compiled");
            if (ProveAndSendWorker.contractVerificationKey === undefined) {
                console.time("compiled SignTestContract");
                ProveAndSendWorker.contractVerificationKey = (await minanft_1.SignTestContract.compile({
                    cache: this.cache,
                })).verificationKey;
                console.timeEnd("compiled SignTestContract");
            }
            console.timeEnd("compiled");
        }
        catch (error) {
            console.error("Error in compile, restarting container", error);
            // Restarting the container, see https://github.com/o1-labs/o1js/issues/1651
            await this.cloud.forceWorkerRestart();
            throw error;
        }
    }
    async create(transaction) {
        throw new Error("not implemented");
    }
    async merge(proof1, proof2) {
        throw new Error("not implemented");
    }
    async execute(transactions) {
        if (this.cloud.args === undefined)
            throw new Error("this.cloud.args is undefined");
        const args = JSON.parse(this.cloud.args);
        console.log("args", args);
        if (args.contractAddress === undefined)
            throw new Error("args.contractAddress is undefined");
        switch (this.cloud.task) {
            case "proveAndSend":
                return await this.sendTx({
                    contractAddress: args.contractAddress,
                    transactions,
                });
            case "prepareTx":
                return await this.prepareTx({
                    contractAddress: args.contractAddress,
                    transactions,
                });
            default:
                throw new Error(`Unknown task: ${this.cloud.task}`);
        }
    }
    async prepareTx(args) {
        if (this.cloud.chain !== "devnet")
            return "Only devnet is supported";
        if (args.transactions.length === 0) {
            return "No transactions to send";
        }
        const { address, value } = JSON.parse(args.transactions[0]);
        console.time("transaction created");
        const zkAppPublicKey = o1js_1.PublicKey.fromBase58(args.contractAddress);
        const sender = o1js_1.PublicKey.fromBase58(address);
        const zkApp = new minanft_1.SignTestContract(zkAppPublicKey);
        await (0, zkcloudworker_1.fetchMinaAccount)({ publicKey: zkAppPublicKey });
        await (0, zkcloudworker_1.fetchMinaAccount)({ publicKey: sender });
        const fee = 200_000_000;
        const memo = `value: ${value}`;
        const tx = await o1js_1.Mina.transaction({ sender, fee, memo }, async () => {
            await zkApp.setValue((0, o1js_1.Field)(value));
        });
        console.timeEnd("transaction created");
        console.log("Tx created", tx);
        const transaction = tx.toJSON();
        function serializeTransaction(tx) {
            const length = tx.transaction.accountUpdates.length;
            let i;
            let blindingValues = [];
            for (i = 0; i < length; i++) {
                const la = tx.transaction.accountUpdates[i].lazyAuthorization;
                if (la !== undefined &&
                    la.blindingValue !== undefined &&
                    la.kind === "lazy-proof")
                    blindingValues.push(la.blindingValue.toJSON());
                else
                    blindingValues.push("");
            }
            const serializedTransaction = JSON.stringify({
                tx: tx.toJSON(),
                blindingValues,
                length,
                fee: tx.transaction.feePayer.body.fee.toJSON(),
                sender: tx.transaction.feePayer.body.publicKey.toBase58(),
                nonce: tx.transaction.feePayer.body.nonce.toBigint().toString(),
            }, null, 2);
            return serializedTransaction;
        }
        const serializedTransaction = serializeTransaction(tx);
        return JSON.stringify({
            transaction,
            serializeTransaction,
        }, null, 2);
    }
    async sendTx(args) {
        if (this.cloud.chain !== "devnet")
            return "Only devnet is supported";
        if (args.transactions.length === 0) {
            return "No transactions to send";
        }
        await (0, zkcloudworker_1.initBlockchain)(this.cloud.chain);
        const { serializedTransaction, signedData, address, value } = JSON.parse(args.transactions[0]);
        const contractAddress = o1js_1.PublicKey.fromBase58(args.contractAddress);
        console.time("prepared tx");
        const { fee, sender, nonce, memo } = (0, deserialize_1.transactionParams)(serializedTransaction);
        const zkApp = new minanft_1.SignTestContract(contractAddress);
        await (0, zkcloudworker_1.fetchMinaAccount)({
            publicKey: contractAddress,
            force: true,
        });
        await (0, zkcloudworker_1.fetchMinaAccount)({
            publicKey: sender,
            force: true,
        });
        const txNew = await o1js_1.Mina.transaction({ sender, fee, nonce, memo }, async () => {
            await zkApp.setValue((0, o1js_1.Field)(value));
        });
        const tx = (0, deserialize_1.deserializeTransaction)(serializedTransaction, txNew);
        //if (tx === undefined) throw new Error("tx is undefined");
        const signedDataJson = JSON.parse(signedData);
        console.log("SignedDataJson", signedDataJson);
        tx.transaction.feePayer.authorization =
            signedDataJson.zkappCommand.feePayer.authorization;
        console.timeEnd("prepared tx");
        await this.compile();
        try {
            console.time("proved tx");
            await tx.prove();
            console.timeEnd("proved tx");
            console.log(`Sending tx...`);
            console.log("sender:", sender.toBase58());
            console.log("Sender balance:", await (0, zkcloudworker_1.accountBalanceMina)(sender));
            const txSent = await tx.safeSend();
            if (txSent.status == "pending") {
                console.log(`tx sent: hash: ${txSent.hash} status: ${txSent.status}`);
            }
            else {
                console.log(`tx NOT sent: hash: ${txSent?.hash} status: ${txSent?.status}`);
                return "Error sending transaction";
            }
            return txSent?.hash ?? "Error sending transaction";
        }
        catch (error) {
            console.error("Error sending transaction", error);
            return "Error sending transaction";
        }
    }
}
exports.ProveAndSendWorker = ProveAndSendWorker;
ProveAndSendWorker.contractVerificationKey = undefined;
async function zkcloudworker(cloud) {
    return new ProveAndSendWorker(cloud);
}
exports.zkcloudworker = zkcloudworker;
