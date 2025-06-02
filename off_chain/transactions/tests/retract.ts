import { mkOutputRefId } from '../../history/indexer';
import { boot } from '../boot';
import { end } from '../end';
import { request } from '../request';
import { retract } from '../retract';
import { setup, sync as sync } from './fixtures';

const { context, close } = await setup(3000);
const tokenId = await boot(context);

await sync(context);
const req = await request(context, tokenId, 'key', 'value', 'insert');
const reqId = mkOutputRefId(req);

await sync(context);
await retract(context, req);

await sync(context);
const reqs = await context.fetchRequests(tokenId);
if (reqs.some(req => req.outputRef === reqId)) {
    throw new Error(
        `Request ID ${reqId} still found in requests after retraction`
    );
}

await sync(context);
await end(context, tokenId);

console.log('- a request was successfully retracted');
await close();
