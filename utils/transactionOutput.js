const { decodeTransact } = require('./decodeTransaction');

function tOutPut(data) {
    if (!data) return null;
    
    const dataTx = data?.transaction?.transaction;
    const signature = dataTx?.signature ? decodeTransact(dataTx.signature) : '';
    const message = dataTx?.transaction?.message;
    const header = message?.header;
    const accountKeys = message?.accountKeys?.map(t => decodeTransact(t)) || [];
    const recentBlockhash = message?.recentBlockhash ? decodeTransact(message.recentBlockhash) : '';
    const instructions = message?.instructions;
    const meta = dataTx?.meta;
    const logs = meta?.logMessages || [];
    const logFilter = logs.some(instruction => instruction.match(/MintTo/i));

    return {
        signature,
        message: {
            header,
            accountKeys,
            recentBlockhash,
            instructions
        },
        meta,
        logFilter
    };
}

module.exports = { tOutPut }; 