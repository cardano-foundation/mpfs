import express from 'express';
import { Context, mkContext } from '../transactions/context';
import { boot } from '../transactions/boot';
import { bootSigningless } from '../transactions/signing-less/boot';
import { update } from '../transactions/update';
import { request } from '../transactions/request';
import { end } from '../transactions/end';
import { retract } from '../transactions/retract';
import { Server } from 'http';
import { createTrieManager } from '../trie';
import { createIndexer, Indexer } from '../indexer/indexer';
import { unmkOutputRefId, mkOutputRefId } from '../outputRef';
import { Level } from 'level';
import { Token } from '../indexer/state/tokens';
import { createState } from '../indexer/state';
import { createProcess } from '../indexer/process';
import { sleep } from '../lib';
import { Checkpoint } from '../indexer/state/checkpoints';

import {
    getCagingScript,
    Provider,
    topup,
    TopUp
} from '../transactions/context/lib';

// API Endpoints
function mkAPI(topup: TopUp | undefined, context: Context) {
    async function withTokens(f: (tokens: Token[]) => any): Promise<any> {
        const tokens = await context.fetchTokens();
        return f(tokens);
    }

    const app = express();

    app.use(express.json()); // Ensure JSON parsing middleware is applied

    app.get('/wallet', async (req, res) => {
        const wallet = context.signingWallet;
        if (!wallet) {
            res.status(404).json({
                error: 'No signing wallet found'
            });
            return;
        }
        const walletInfo = await wallet.info();
        res.json(walletInfo);
    });
    if (topup) {
        app.put('/wallet/topup', async (req, res) => {
            const { amount } = req.body;
            try {
                const wallet = context.signingWallet;
                if (!wallet) {
                    res.status(404).json({
                        error: 'No signing wallet found'
                    });
                    return;
                }
                const { walletAddress } = await wallet.info();
                await topup(walletAddress, amount);
                res.json({ message: 'Top up successful' });
            } catch (error) {
                res.status(500).json({
                    error: 'Error topping up wallet',
                    details: error
                });
            }
        });
    }

    app.get('/transaction/create-token/:walletAddress', async (req, res) => {
        const { walletAddress } = req.params;
        try {
            const result = await bootSigningless(context, walletAddress);
            res.json(result);
        } catch (error) {
            console.error('Error booting:', error);
            res.status(500).json({
                error: 'Error booting',
                details: JSON.stringify(error)
            });
        }
    });

    app.post('/token', async (req, res) => {
        try {
            const tokenId = await boot(context);
            res.json({ tokenId });
        } catch (error) {
            console.error('Error booting:', error);
            res.status(500).json({
                error: 'Error booting',
                details: JSON.stringify(error)
            });
        }
    });

    app.get('/tokens', async (req, res) => {
        try {
            const indexerStatus = await context.tips();
            const tokens = await withTokens(tokens => tokens);
            res.json({
                tokens,
                indexerStatus
            });
        } catch (error) {
            res.status(500).json({
                error: 'Error fetching tokens',
                details: error.message
            });
        }
    });

    app.get('/token/:tokenId', async (req, res) => {
        const { tokenId } = req.params;

        try {
            const token: Token = await withTokens(tokens =>
                tokens.find(token => token.tokenId === tokenId)
            );

            if (!token) {
                res.status(404).json({
                    error: `GET token: Token ${tokenId} not found`
                });
                return;
            }
            const requests = await context.fetchRequests(tokenId);
            res.json({
                ...token.current,
                requests
            });
        } catch (error) {
            res.status(500).json({
                error: 'Error fetching token',
                details: error.message
            });
        }
    });
    app.put('/token/:tokenId', async (req, res) => {
        const { tokenId } = req.params;
        const { requestIds } = req.body;
        const refs = requestIds.map(unmkOutputRefId);
        try {
            const tx = await update(context, tokenId, refs);
            res.json({ txHash: tx });
        } catch (error) {
            res.status(500).json({
                error: 'Error updating',
                details: error.message
            });
        }
    });

    app.delete('/token/:tokenId', async (req, res) => {
        const { tokenId } = req.params;
        try {
            const tx = await end(context, tokenId);

            res.json({ txHash: tx });
        } catch (error) {
            res.status(500).json({
                error: 'Error ending',
                details: error.message
            });
        }
    });

    app.post('/token/:tokenId/request', async (req, res) => {
        const { tokenId } = req.params;
        const { key, value, operation } = req.body;

        try {
            const ref = await request(context, tokenId, key, value, operation);
            const ref2 = mkOutputRefId(ref);

            res.json(ref2);
        } catch (error) {
            res.status(500).json({
                error: 'Error requesting',
                details: error.message
            });
        }
    });

    app.delete('/request/:refId/', async (req, res) => {
        const { refId } = req.params;
        const { txHash, outputIndex } = unmkOutputRefId(refId);
        try {
            const tx = await retract(context, { txHash, outputIndex });
            res.json({ txHash: tx });
        } catch (error) {
            res.status(500).json({
                error: 'Error retracting',
                details: error.message
            });
        }
    });

    app.get('/token/:tokenId/facts', async (req, res) => {
        const { tokenId } = req.params;
        try {
            const facts = await context.facts(tokenId);
            res.json(facts);
        } catch (error) {
            res.status(500).json({
                error: 'Error fetching facts',
                details: error.message
            });
        }
    });

    app.post('/indexer/wait-blocks', async (req, res) => {
        const { n } = req.body;
        const height = await context.waitBlocks(n);
        res.json({ height });
    });

    return app;
}

export type Service = {
    server: Server;
    indexer: Indexer;
    db: Level<string, any>;
};

export type Name = {
    name: string;
    port: number;
    mnemonics: string;
};

export async function withService(
    port: number,
    logsPath: string,
    dbPath: string,
    provider: Provider,
    mnemonics: string,
    ogmios: string,
    since: Checkpoint | null = null,
    f
): Promise<void> {
    const db: Level<any, any> = new Level(`${dbPath}/${port}`, {
        valueEncoding: 'json',
        keyEncoding: 'utf8'
    });
    await db.open();

    try {
        const tries = await createTrieManager(db);
        const state = await createState(db, tries, 2160, since);

        const { address, policyId } = getCagingScript();
        const process = createProcess(state, address, policyId);

        const indexer = await createIndexer(state, process, ogmios);
        try {
            const context = mkContext(
                provider,
                mnemonics,
                indexer,
                state,
                tries
            );
            const app = mkAPI(async (address: string, amount: number) => {
                await topup(provider)(address, amount);
            }, context);
            const server = app.listen(port);
            await new Promise<void>((resolve, reject) => {
                server.on('listening', resolve);
                server.on('error', reject);
            });
            try {
                await f();
            } catch (error) {
                console.error(`Error in service on port ${port}:`, error);
            } finally {
                server.close();
            }
        } finally {
            await indexer.close();
            await sleep(1);
            await state.close();
            await tries.close();
        }
    } finally {
        await db.close();
    }
}

export async function withServices(
    logsPath: string,
    dbPath: string,
    names: Name[],
    provider: Provider,
    ogmios: string,
    since: Checkpoint | null = null,
    f
): Promise<void> {
    async function loop(names: Name[]) {
        if (names.length === 0) {
            await f();
            return;
        }
        const { port, name, mnemonics } = names[0];
        const remainingNames = names.slice(1);
        await withService(
            port,
            logsPath,
            dbPath,
            provider,
            mnemonics,
            ogmios,
            since,
            async () => await loop(remainingNames)
        );
    }
    await loop(names);
}
