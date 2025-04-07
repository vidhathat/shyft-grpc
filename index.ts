require('dotenv').config();

import Client, {
  CommitmentLevel,
  SubscribeRequestAccountsDataSlice,
  SubscribeRequestFilterAccounts,
  SubscribeRequestFilterBlocks,
  SubscribeRequestFilterBlocksMeta,
  SubscribeRequestFilterEntry,
  SubscribeRequestFilterSlots,
  SubscribeRequestFilterTransactions,
} from "@triton-one/yellowstone-grpc";
import { SubscribeRequestPing } from "@triton-one/yellowstone-grpc/dist/grpc/geyser";
import { PublicKey, VersionedTransactionResponse } from "@solana/web3.js";
import { Idl } from "@project-serum/anchor";
import { SolanaParser } from "@shyft-to/solana-transaction-parser";
import { TransactionFormatter } from "./utils/transaction-formatter";
import pumpFunIdl from "./idls/pump_0.1.0.json";
import { SolanaEventParser } from "./utils/event-parser";
import { bnLayoutFormatter } from "./utils/bn-layout-formatter";

// Export the SubscribeRequest interface
export interface SubscribeRequest {
  accounts: { [key: string]: SubscribeRequestFilterAccounts };
  slots: { [key: string]: SubscribeRequestFilterSlots };
  transactions: { [key: string]: SubscribeRequestFilterTransactions };
  transactionsStatus: { [key: string]: SubscribeRequestFilterTransactions };
  blocks: { [key: string]: SubscribeRequestFilterBlocks };
  blocksMeta: { [key: string]: SubscribeRequestFilterBlocksMeta };
  entry: { [key: string]: SubscribeRequestFilterEntry };
  commitment?: CommitmentLevel | undefined;
  accountsDataSlice: SubscribeRequestAccountsDataSlice[];
  ping?: SubscribeRequestPing | undefined;
}

// Global state for stream and subscription
export let globalStream: any = null;
export let globalSubscription: SubscribeRequest | null = null;

// Constants and configurations
const TRACKED_WALLETS = [
  "HhxyMSCowbbipGVj3CGGfkG7jxcu7jgVxz34wKs5g7Fu",
  // Add more wallets here
];

const TXN_FORMATTER = new TransactionFormatter();
const PUMP_FUN_PROGRAM_ID = new PublicKey(
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"
);

const VINE_TOKEN_ID = new PublicKey("6AJcP7wuLwmRYLBNbi825wgguaPsWzPBEHcHndpRpump");
const Raydium_amm = new PublicKey("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");
const Chomp_protocol = new PublicKey("CHoMPttewvAWpWqJLkfeKU29uKQQhi3NW96pb86Dcby4");
const Chomp_protocol_v2 = new PublicKey("L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95");
const Time_fun = new PublicKey("BcyCjbQYxE2m2xTZ5tTZXDEz8Up7avTmPqhzCrASRKiQ");

// Initialize parsers
const CHOMP_PROTOCOL_IX_PARSER = new SolanaParser([]);
CHOMP_PROTOCOL_IX_PARSER.addParserFromIdl(
  Chomp_protocol.toBase58(),
  pumpFunIdl as Idl,
);

const CHOMP_PROTOCOL_EVENT_PARSER = new SolanaEventParser([], console);
CHOMP_PROTOCOL_EVENT_PARSER.addParserFromIdl(
  Chomp_protocol.toBase58(),
  pumpFunIdl as Idl,
);

// Initial subscription request
const subscribeRequest1: SubscribeRequest = {
  accounts: {},
  slots: {},
  transactions: {
    chompProtocol: {
      vote: false,
      failed: false,
      signature: undefined,
      accountInclude: ["L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95"],
      accountExclude: [],
      accountRequired: [Chomp_protocol.toBase58()],
    },
  },
  transactionsStatus: {},
  entry: {},
  blocks: {},
  blocksMeta: {},
  accountsDataSlice: [],
  ping: undefined,
  commitment: CommitmentLevel.CONFIRMED,
};

// Helper functions for subscription management
export function createTransactionMonitor(accountInclude: string[], accountRequired: string[]) {
  return {
    vote: false,
    failed: false,
    signature: undefined,
    accountInclude,
    accountExclude: [],
    accountRequired,
  };
}

export async function updateSubscription(stream: any, args: SubscribeRequest) {
  try {
    stream.write(args);
    console.log("Subscription request updated successfully");
  } catch (error) {
    console.error("Failed to update subscription:", error);
  }
}

export async function addNewTransactionMonitor(
  stream: any, 
  currentRequest: SubscribeRequest,
  monitorName: string,
  accountInclude: string[],
  accountRequired: string[]
) {
  try {
    const updatedRequest: SubscribeRequest = {
      ...currentRequest,
      transactions: {
        ...currentRequest.transactions,
        [monitorName]: createTransactionMonitor(accountInclude, accountRequired)
      }
    };

    await updateSubscription(stream, updatedRequest);
    console.log(`Added new transaction monitor: ${monitorName}`);
    return updatedRequest;
  } catch (error) {
    console.error(`Failed to add transaction monitor ${monitorName}:`, error);
    return currentRequest;
  }
}

globalSubscription = subscribeRequest1;
async function handleStream(client: Client, args: SubscribeRequest) {
  const stream = await client.subscribe();
  
  // Update global references
  globalStream = stream;
  globalSubscription = args;

  // Create `error` / `end` handler
  const streamClosed = new Promise<void>((resolve, reject) => {
    stream.on("error", (error) => {
      console.log("ERROR", error);
      reject(error);
      stream.end();
    });
    stream.on("end", () => {
      resolve();
    });
    stream.on("close", () => {
      resolve();
    });
  });

  // Handle updates
  stream.on("data", (data) => {
    if (data?.transaction) {
      const txn = TXN_FORMATTER.formTransactionFromJson(
        data.transaction,
        Date.now(),
      );
      const parsedTxn = decodePumpFunTxn(txn);

      if (!parsedTxn) return;

      console.log(
        new Date(),
        ":",
        `New transaction https://translator.shyft.to/tx/${txn.transaction.signatures[0]} \n`,
      );
    }
  });

  // Send initial subscribe request
  await new Promise<void>((resolve, reject) => {
    stream.write(args, (err: any) => {
      if (err === null || err === undefined) {
        resolve();
      } else {
        reject(err);
      }
    });
  }).catch((reason) => {
    // console.error(reason);
    throw reason;
  });

  await streamClosed;
}

async function subscribeCommand(client: Client, args: SubscribeRequest) {
  while (true) {
    try {
      await handleStream(client, args);
    } catch (error) {
      // console.error("Stream error, restarting in 1 second...", error);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

function decodePumpFunTxn(tx: VersionedTransactionResponse) {
  if (tx.meta?.err) return;

  const paredIxs = CHOMP_PROTOCOL_IX_PARSER.parseTransactionData(
    tx.transaction.message,
    tx.meta.loadedAddresses,
  );

  const pumpFunIxs = paredIxs.filter((ix) =>
    ix.programId.equals(PUMP_FUN_PROGRAM_ID),
  );

  const chompProtocolIxs = paredIxs.filter((ix) =>
    ix.programId.equals(Chomp_protocol_v2),
  );

  const signerAccounts = chompProtocolIxs.flatMap(ix => 
    ix.accounts.filter(acc => acc.isSigner).map(acc => ({
      instructionName: ix.name,
      programId: ix.programId.toString(),
      account: {
        name: acc.name,
        pubkey: acc.pubkey.toString(),
        isWritable: acc.isWritable
      }
    }))
  );

  if (signerAccounts.length > 0) {
    console.log("\n=== Checking Signer Accounts ===");
    console.log("Signer pubkeys:", signerAccounts.map(acc => acc.account.pubkey));
    console.log("Looking for wallets:", TRACKED_WALLETS);
    
    const foundWallets = signerAccounts.filter(acc => 
      TRACKED_WALLETS.includes(acc.account.pubkey)
    );

    if (foundWallets.length > 0) {
      console.log("\n✅ Tracked wallets found in signer accounts!");
      console.log("Matched wallets:", foundWallets);
      console.log("===========================\n");
      return true;
    } else {
      console.log("❌ No tracked wallets found in signers");
      console.log("===========================\n");
    }
  }
  if (chompProtocolIxs.length === 0) return;
  const events = CHOMP_PROTOCOL_EVENT_PARSER.parseEvent(tx);
  const result = { instructions: chompProtocolIxs, events };
  bnLayoutFormatter(result);
  return result;
}

// Initialize client and start subscription
const client = new Client(
  process.env.GRPC_URL!,
  process.env.X_TOKEN,
  undefined,
);

subscribeCommand(client, subscribeRequest1);