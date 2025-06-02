import { mkOutputRefId } from '../../history/indexer';
import { boot } from '../boot';
import { end } from '../end';
import { request } from '../request';
import { setup, sync } from './fixtures';

const { context, close } = await setup(3000);

const tokenId = await boot(context);

await sync(context);
const ref = await request(context, tokenId, 'key', 'value', 'insert');
const refId = mkOutputRefId(ref); // Momentarily hack, c39315f

await sync(context);
const requests = await context.fetchRequests(tokenId);
if (!requests.some(req => req.outputRef === refId)) {
    throw new Error(`Request ID ${refId} not found in requests`);
}

await sync(context);
await end(context, tokenId);

console.log('- a request was succesfully submitted');
await close();
