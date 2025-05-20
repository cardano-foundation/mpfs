import { withContext } from '../../context';
import { boot } from '../boot';
import { end } from '../end';
import { request } from '../request';
import { update } from '../update';
import { setup } from './fixtures';

const context = await setup();
const tokenId = await withContext(
    'tmp/boot',
    'log',
    context,
    async context => await boot(context)
);
console.log("boot, token-id", tokenId);

const requestOutputRef = await withContext(
    'tmp/request',
    'log',
    context,
    async context =>
        await request(context, tokenId, 'key', 'value', 'insert')
);
console.log("request, output-ref", requestOutputRef);

const txHashUpdate = await withContext(
    'tmp/update',
    'log',
    context,
    async context =>
        await update(context, tokenId, [requestOutputRef])
);

console.log("update, tx-hash", txHashUpdate);

const txHash = await withContext(
    'tmp/end',
    'log',
    context,
    async context => await end(context, tokenId)
);
console.log("end, tx-hash", txHash);
