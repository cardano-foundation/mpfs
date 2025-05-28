import { withContext } from '../../context';
import { boot } from '../boot';
import { end } from '../end';
import { request } from '../request';
import { setup } from './fixtures';

const context = await setup(3000);
const tokenId = await withContext(
    'tmp/boot',
    'log',
    context,
    async context => await boot(context)
);
console.log('booted token-id', tokenId);

const { txHash: txHashRq, outputIndex: outputIndexRq } = await withContext(
    'tmp/request',
    'log',
    context,
    async context => await request(context, tokenId, 'key', 'value', 'insert')
);
console.log('request utxo', txHashRq, outputIndexRq);

const txHash = await withContext(
    'tmp/end',
    'log',
    context,
    async context => await end(context, tokenId)
);
console.log('ending token-id tx-hash', txHash);
