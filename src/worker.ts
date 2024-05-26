import {
  zkCloudWorker,
  Cloud,
  DeployedSmartContract,
  sleep,
  fetchMinaAccount,
  accountBalanceMina,
  initBlockchain,
} from "zkcloudworker";
import { VerificationKey, PublicKey, Mina, Field, Cache } from "o1js";
import { SignTestContract } from "minanft";
import { transactionParams, deserializeTransaction } from "./deserialize";

export class ProveAndSendWorker extends zkCloudWorker {
  static contractVerificationKey: VerificationKey | undefined = undefined;
  readonly cache: Cache;

  constructor(cloud: Cloud) {
    super(cloud);
    this.cache = Cache.FileSystem(this.cloud.cache);
  }

  public async deployedContracts(): Promise<DeployedSmartContract[]> {
    throw new Error("not implemented");
  }

  private async compile(): Promise<void> {
    try {
      console.time("compiled");

      if (ProveAndSendWorker.contractVerificationKey === undefined) {
        console.time("compiled SignTestContract");
        ProveAndSendWorker.contractVerificationKey = (
          await SignTestContract.compile({
            cache: this.cache,
          })
        ).verificationKey;
        console.timeEnd("compiled SignTestContract");
      }
      console.timeEnd("compiled");
    } catch (error) {
      console.error("Error in compile, restarting container", error);
      // Restarting the container, see https://github.com/o1-labs/o1js/issues/1651
      await this.cloud.forceWorkerRestart();
      throw error;
    }
  }

  public async create(transaction: string): Promise<string | undefined> {
    throw new Error("not implemented");
  }

  public async merge(
    proof1: string,
    proof2: string
  ): Promise<string | undefined> {
    throw new Error("not implemented");
  }

  public async execute(transactions: string[]): Promise<string | undefined> {
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

  private async prepareTx(args: {
    contractAddress: string;
    transactions: string[];
  }): Promise<string> {
    if (this.cloud.chain !== "devnet") return "Only devnet is supported";
    if (args.transactions.length === 0) {
      return "No transactions to send";
    }
    const { address, value }: { address: string; value: number } = JSON.parse(
      args.transactions[0]
    );
    console.time("transaction created");
    const zkAppPublicKey = PublicKey.fromBase58(args.contractAddress);
    const sender = PublicKey.fromBase58(address);
    const zkApp = new SignTestContract(zkAppPublicKey);
    await fetchMinaAccount({ publicKey: zkAppPublicKey });
    await fetchMinaAccount({ publicKey: sender });
    const fee = 200_000_000;
    const memo = `value: ${value}`;
    const tx = await Mina.transaction({ sender, fee, memo }, async () => {
      await zkApp.setValue(Field(value));
    });
    console.timeEnd("transaction created");
    console.log("Tx created", tx);

    const transaction = tx.toJSON();
    function serializeTransaction(tx: Mina.Transaction<false, false>) {
      const length = tx.transaction.accountUpdates.length;
      let i;
      let blindingValues = [];
      for (i = 0; i < length; i++) {
        const la = tx.transaction.accountUpdates[i].lazyAuthorization;
        if (
          la !== undefined &&
          (la as any).blindingValue !== undefined &&
          la.kind === "lazy-proof"
        )
          blindingValues.push(la.blindingValue.toJSON());
        else blindingValues.push("");
      }
      const serializedTransaction = JSON.stringify(
        {
          tx: tx.toJSON(),
          blindingValues,
          length,
          fee: tx.transaction.feePayer.body.fee.toJSON(),
          sender: tx.transaction.feePayer.body.publicKey.toBase58(),
          nonce: tx.transaction.feePayer.body.nonce.toBigint().toString(),
        },
        null,
        2
      );
      return serializedTransaction;
    }
    const serializedTransaction = serializeTransaction(tx);
    return JSON.stringify(
      {
        transaction,
        serializedTransaction,
        fee,
        memo,
      },
      null,
      2
    );
  }

  private async sendTx(args: {
    contractAddress: string;
    transactions: string[];
  }): Promise<string> {
    if (this.cloud.chain !== "devnet") return "Only devnet is supported";
    if (args.transactions.length === 0) {
      return "No transactions to send";
    }
    await initBlockchain(this.cloud.chain);

    const { serializedTransaction, signedData, address, value } = JSON.parse(
      args.transactions[0]
    );
    const contractAddress = PublicKey.fromBase58(args.contractAddress);

    console.time("prepared tx");
    const { fee, sender, nonce, memo } = transactionParams(
      serializedTransaction
    );
    const zkApp = new SignTestContract(contractAddress);
    await fetchMinaAccount({
      publicKey: contractAddress,
      force: true,
    });
    await fetchMinaAccount({
      publicKey: sender,
      force: true,
    });
    const txNew = await Mina.transaction(
      { sender, fee, nonce, memo },
      async () => {
        await zkApp.setValue(Field(value));
      }
    );
    const tx = deserializeTransaction(serializedTransaction, txNew);
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
      console.log("Sender balance:", await accountBalanceMina(sender));
      const txSent = await tx.safeSend();
      if (txSent.status == "pending") {
        console.log(`tx sent: hash: ${txSent.hash} status: ${txSent.status}`);
      } else {
        console.log(
          `tx NOT sent: hash: ${txSent?.hash} status: ${txSent?.status}`
        );
        return "Error sending transaction";
      }
      return txSent?.hash ?? "Error sending transaction";
    } catch (error) {
      console.error("Error sending transaction", error);
      return "Error sending transaction";
    }
  }
}

export async function zkcloudworker(cloud: Cloud): Promise<zkCloudWorker> {
  return new ProveAndSendWorker(cloud);
}
