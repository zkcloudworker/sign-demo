import { zkCloudWorker, Cloud, DeployedSmartContract } from "zkcloudworker";
import { VerificationKey, Cache } from "o1js";
export declare class ProveAndSendWorker extends zkCloudWorker {
    static contractVerificationKey: VerificationKey | undefined;
    readonly cache: Cache;
    constructor(cloud: Cloud);
    deployedContracts(): Promise<DeployedSmartContract[]>;
    private compile;
    create(transaction: string): Promise<string | undefined>;
    merge(proof1: string, proof2: string): Promise<string | undefined>;
    execute(transactions: string[]): Promise<string | undefined>;
    private prepareTx;
    private sendTx;
}
export declare function zkcloudworker(cloud: Cloud): Promise<zkCloudWorker>;
