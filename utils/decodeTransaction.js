const bs58 = require('bs58');

function decodeTransact(input) {
    if (!input) return '';
    try {
        return bs58.encode(Buffer.from(input));
    } catch (error) {
        console.error('Error decoding transaction:', error);
        return '';
    }
}

module.exports = { decodeTransact }; 