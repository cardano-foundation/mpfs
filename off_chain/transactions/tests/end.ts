import { withContext } from '../../context';
import { boot } from '../boot';
import { end } from '../end';
import { setup } from './fixtures';

const context = await setup(3000);
const tokenId = await withContext(
    'tmp/boot',
    'log',
    context,
    async context => await boot(context)
);
console.log(tokenId);
const txHash = await withContext(
    'tmp/end',
    'log',
    context,
    async context => await end(context, tokenId)
);
console.log(txHash);
