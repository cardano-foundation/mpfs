import { boot } from '../boot';
import { end } from '../end';
import { setup, sync } from './fixtures';

const { context, close } = await setup(3000);

const tokenId = await boot(context);

await sync(context);
const token = await context.fetchToken(tokenId);

if (!token) {
    throw new Error(`Token not found: ${tokenId}`);
}

try {
    await sync(context);
    await end(context, tokenId);
} catch (error) {
    console.error(`Error ending token: ${error.message}. Not failing the test`);
}

console.log('- a token was successfully created');
await close();
