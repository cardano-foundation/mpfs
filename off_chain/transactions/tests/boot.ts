import { withContext } from '../../context';
import { findTokens } from '../../token';
import { boot } from '../boot';
import { setup } from './fixtures';

const context = await setup(3000);
const tokenId = await withContext(
    'tmp/boot',
    'log',
    context,
    async context => await boot(context)
);
console.log(tokenId);

const tokens = await withContext(
    'tmp/tokens',
    'log',
    context,
    async context => {
        const utxos = await context.fetchUTxOs();
        findTokens(utxos);
    }
);
console.log('tokens', tokens);
const token = tokens.find(token => token.tokenId === tokenId);
if (!token) {
    throw new Error(`Token not found: ${tokenId}`);
}
console.log('token', token);
