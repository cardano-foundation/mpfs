import { mkOutputRefId } from '../../history/store';
import { boot } from '../boot';
import { end } from '../end';
import { request } from '../request';
import { update } from '../update';
import { setup, sync } from './fixtures';

const { context, close } = await setup(3000);
const tokenId = await boot(context);

await sync(context);
const requestRef = await request(context, tokenId, 'key', 'value', 'insert');
const requestRefId = mkOutputRefId(requestRef);

await sync(context);
await update(context, tokenId, [requestRef]);

await sync(context);
const requests = await context.fetchRequests(tokenId);
if (requests.some(req => req.outputRef === requestRefId)) {
    throw new Error(
        `Request ID ${requestRefId} still found in requests after update`
    );
}

await sync(context);
const facts = await context.facts(tokenId);
if (!facts['key']) {
    throw new Error(`Fact 'key' not found in facts after update`);
}

const value = facts['key'];
if (value !== 'value') {
    throw new Error(
        `Fact 'key' has unexpected value: ${value}. Expected 'value'.`
    );
}

await sync(context);
await end(context, tokenId);

console.log('- a token was updated successfully.');
await close();
