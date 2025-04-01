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
import { TransactionFormatter } from "../utils/transaction-formatter";
import pumpFunIdl from "../idls/pump_0.1.0.json";
import { SolanaEventParser } from "../utils/event-parser";
import { bnLayoutFormatter } from "../utils/bn-layout-formatter";

interface SubscribeRequest {
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
const TRACKED_WALLETS = [
  "HhxyMSCowbbipGVj3CGGfkG7jxcu7jgVxz34wKs5g7Fu",
  // Add more wallets here
];
const TXN_FORMATTER = new TransactionFormatter();
const PUMP_FUN_PROGRAM_ID = new PublicKey(
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"
);

const VINE_TOKEN_ID= new PublicKey("6AJcP7wuLwmRYLBNbi825wgguaPsWzPBEHcHndpRpump");
const Raydium_amm = new PublicKey("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");
// const Raydium_protocol = new PublicKey("675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8");
const PUMP_FUN_IX_PARSER = new SolanaParser([]);
PUMP_FUN_IX_PARSER.addParserFromIdl(
  PUMP_FUN_PROGRAM_ID.toBase58(),
  pumpFunIdl as Idl,
);

const RAYDIUM_AMM_IX_PARSER = new SolanaParser([]);
RAYDIUM_AMM_IX_PARSER.addParserFromIdl(
  Raydium_amm.toBase58(),
  pumpFunIdl as Idl,
);



const PUMP_FUN_EVENT_PARSER = new SolanaEventParser([], console);
PUMP_FUN_EVENT_PARSER.addParserFromIdl(
  PUMP_FUN_PROGRAM_ID.toBase58(),
  pumpFunIdl as Idl,
);

const RAYDIUM_AMM_EVENT_PARSER = new SolanaEventParser([], console);
RAYDIUM_AMM_EVENT_PARSER.addParserFromIdl(
  Raydium_amm.toBase58(),
  pumpFunIdl as Idl,
);

async function handleStream(client: Client, args: SubscribeRequest) {
  // Subscribe for events
  const stream = await client.subscribe();

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
      // console.log('parsedTxn is',JSON.stringify(parsedTxn, null, 2));

      if (!parsedTxn) return;

      console.log(
        new Date(),
        ":",
        `New transaction https://translator.shyft.to/tx/${txn.transaction.signatures[0]} \n`,
        JSON.stringify(parsedTxn, null, 2) + "\n",
      );
    }
  });

  // Send subscribe request
  await new Promise<void>((resolve, reject) => {
    stream.write(args, (err: any) => {
      if (err === null || err === undefined) {
        resolve();
      } else {
        reject(err);
      }
    });
  }).catch((reason) => {
    console.error(reason);
    throw reason;
  });

  await streamClosed;
}

async function subscribeCommand(client: Client, args: SubscribeRequest) {
  while (true) {
    try {
      await handleStream(client, args);
    } catch (error) {
      console.error("Stream error, restarting in 1 second...", error);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

const client = new Client(
  process.env.GRPC_URL!,
  process.env.X_TOKEN,
  undefined,
);

const req: SubscribeRequest = {
  accounts: {},
  slots: {},
  transactions: {

    raydiumAmm: {
      vote: false,
      failed: false,
      signature: undefined,
      accountInclude: [Raydium_amm.toBase58()],
      accountExclude: [],
      accountRequired: [],  
    },
    pumpFun: {
      vote: false,
      failed: false,
      signature: undefined,
      accountInclude: [PUMP_FUN_PROGRAM_ID.toBase58()],
      accountExclude: [],
      accountRequired: [],
      // accountRequired: [PUMP_FUN_PROGRAM_ID.toBase58()],
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

subscribeCommand(client, req);

function decodePumpFunTxn(tx: VersionedTransactionResponse) {
  if (tx.meta?.err) return;

  const paredIxs = PUMP_FUN_IX_PARSER.parseTransactionData(
    tx.transaction.message,
    tx.meta.loadedAddresses,
  );
  const pumpFunIxs = paredIxs.filter((ix) =>
    ix.programId.equals(PUMP_FUN_PROGRAM_ID),
  );
  const vineTokenIxs = paredIxs.filter((ix) =>
    ix.programId.equals(VINE_TOKEN_ID),
  );

  const raydiumAmmIxs = paredIxs.filter((ix) =>
    ix.programId.equals(Raydium_amm),
  );

  console.log('raydiumAmmIxs', raydiumAmmIxs);

    // // Get all signer accounts from pumpFunIxs
    // const signerAccounts = pumpFunIxs.flatMap(ix => 
    //   ix.accounts.filter(acc => acc.isSigner).map(acc => ({
    //     instructionName: ix.name,
    //     programId: ix.programId.toString(),
    //     account: {
    //       name: acc.name,
    //       pubkey: acc.pubkey.toString(),
    //       isWritable: acc.isWritable
    //     }
    //   }))
    // );
  
    // if (signerAccounts.length > 0) {
    //   console.log("\n=== Signer Accounts Found ===");
    //   console.log(JSON.stringify(signerAccounts, null, 2));
    //   console.log("===========================\n");
    // }

  if (pumpFunIxs.length === 0 && raydiumAmmIxs.length === 0) return;
  const events = PUMP_FUN_EVENT_PARSER.parseEvent(tx);
  const raydiumAmmEvents = RAYDIUM_AMM_EVENT_PARSER.parseEvent(tx);
  const result = { instructions: pumpFunIxs, events, raydiumAmmEvents };
  bnLayoutFormatter(result);
  return result;
}

function isRelevantTransaction(accounts: string[]): boolean {
  const relevantAccounts = accounts.filter(account => TRACKED_WALLETS.includes(account));
  
  if (relevantAccounts.length > 0) {
    console.log("\n=== Tracked Wallet Activity Detected ===");
    console.log("Tracked wallets involved:", relevantAccounts);
    console.log("All accounts in transaction:", accounts);
    console.log("=====================================\n");
    return true;
  }
  
  return false;
}
