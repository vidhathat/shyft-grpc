require('dotenv').config();
const { Connection, SlotSubscribeRequest, SubscribeRequestFilterAccounts, CommitmentLevel } = require('@triton-one/yellowstone-grpc');
const { tOutPut } = require('./utils/transactionOutput');
const { getTokenInfo } = require('./utils/tokenInfo');

// Program ID for pump.fun
const PUMP_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';

// Create connection
const connection = new Connection(
    'grpc.shyft.to:443',
    process.env.SHYFT_API_KEY
);

// Subscribe to transactions
const call = connection.subscribeTransaction(
    new SubscribeRequestFilterAccounts({
        accounts: [PUMP_PROGRAM_ID],
        commitment: CommitmentLevel.CONFIRMED
    })
);

console.log('Subscribed to pump.fun transactions');

// Handle incoming transactions
call.on('data', async (data) => {
    try {
        const result = await tOutPut(data);
        
        if (result?.logFilter) {
            const tokenStream = result?.meta?.postTokenBalances[0];
            const mint = tokenStream?.mint;
            
            if (mint) {
                const tokenInfo = await getTokenInfo(mint);
                
                if (tokenInfo) {
                    console.log(`
CA| ${mint}
Name| ${tokenInfo.name}
Symbol| ${tokenInfo.symbol}
Desc| ${tokenInfo.desc}
Decimal| ${tokenInfo.decimal}
Supply| ${tokenInfo.supply}
https://solscan.io/tx/${result.signature}
-------------------`);
                }
            }
        }
    } catch (error) {
        console.error('Error processing transaction:', error);
    }
});

// Handle errors
call.on('error', (error) => {
    console.error('gRPC error:', error);
});

// Handle end of stream
call.on('end', () => {
    console.log('Stream ended');
    // Attempt to reconnect after 5 seconds
    setTimeout(() => {
        console.log('Attempting to reconnect...');
        // Recreate the stream
        const newCall = connection.subscribeTransaction(
            new SubscribeRequestFilterAccounts({
                accounts: [PUMP_PROGRAM_ID],
                commitment: CommitmentLevel.CONFIRMED
            })
        );
        
        // Copy event handlers
        newCall.on('data', call._events.data);
        newCall.on('error', call._events.error);
        newCall.on('end', call._events.end);
        
        call = newCall;
    }, 5000);
}); 