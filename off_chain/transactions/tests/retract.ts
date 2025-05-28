import { withContext } from '../../context';
import { boot } from '../boot';
import { end } from '../end';
import { request } from '../request';
import { retract } from '../retract';
import { setup } from './fixtures';

const context = await setup(3000);
const tokenId = await withContext(
    'tmp/boot',
    'log',
    context,
    async context => await boot(context)
);
console.log('boot, token-id', tokenId);

const reqUTxO = await withContext(
    'tmp/request',
    'log',
    context,
    async context => await request(context, tokenId, 'key', 'value', 'insert')
);
console.log('request, utxo', reqUTxO);

const txHashRetract = await withContext(
    'tmp/retract',
    'log',
    context,
    async context => await retract(context, reqUTxO)
);

console.log('retract, tx-hash', txHashRetract);

const txHash = await withContext(
    'tmp/end',
    'log',
    context,
    async context => await end(context, tokenId)
);
console.log('end, tx-hash', txHash);
