require('dotenv').config();

async function getTokenInfo(token) {
    const headers = new Headers();
    headers.append('x-api-key', process.env.SHYFT_API_KEY);

    try {
        const response = await fetch(
            `https://api.shyft.to/sol/v1/token/get_info?network=mainnet-beta&token_address=${token}`,
            {
                method: 'GET',
                headers: headers
            }
        );

        const infoJson = await response.json();
        const result = infoJson.result;

        return {
            name: result.name,
            symbol: result.symbol,
            desc: result.description,
            decimal: result.decimals,
            supply: result.current_supply
        };
    } catch (error) {
        console.error('Error fetching token info:', error);
        return null;
    }
}

module.exports = { getTokenInfo }; 