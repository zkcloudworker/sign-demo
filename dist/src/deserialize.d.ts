import { PublicKey, Transaction, Mina, UInt64 } from "o1js";
export declare function transactionParams(serializedTransaction: string): {
    fee: UInt64;
    sender: PublicKey;
    nonce: number;
    memo: string;
};
export declare function deserializeTransaction(serializedTransaction: string, txNew: Mina.Transaction<false, false>): Transaction<false, false>;
