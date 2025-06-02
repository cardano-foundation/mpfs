import { boot } from '../boot';
import { end } from '../end';
import { setup, sync } from './fixtures';

const { context, close } = await setup(3000);

const tokenId = await boot(context);
await sync(context);
await end(context, tokenId);

await sync(context);
const token = await context.fetchToken(tokenId);

if (token) {
    throw new Error(`Token ${tokenId} is still present in tokens.`);
}

console.log('- a token successfully deleted');
await close();
