import express from 'express';
import {
    newContext,
    withContext,
    ContextProvider,
    TopUp,
    getCagingScript
} from '../context';
import { boot } from '../transactions/boot';
import { update } from '../transactions/update';
import { request } from '../transactions/request';
import { end } from '../transactions/end';
import { retract } from '../transactions/retract';
import { Server } from 'http';
import { MeshWallet } from '@meshsdk/core';
import { TrieManager } from '../trie';
import { Indexer, mkOutputRefId, unmkOutputRefId } from '../history/indexer';

// API Endpoints
function mkAPI(topup: TopUp | undefined, context): Function {
    async function withTokens(f: (tokens: any[]) => any): Promise<any> {
        const tokens = await withContext(
            'tmp/tokens',
            'log',
            context,
            async context => {
                return await context.fetchTokens();
            }
        );
        return f(tokens);
    }

    const app = express();

    app.use(express.json()); // Ensure JSON parsing middleware is applied

    app.get('/wallet', async (req, res) => {
        const wallet = await withContext(
            'tmp/wallet',
            'log',
            context,
            async context => {
                return await context.wallet();
            }
        );
        res.json({
            address: wallet.walletAddress,
            owner: wallet.signerHash,
            utxos: wallet.utxos
        });
    });
    if (topup) {
        app.put('/wallet/topup', async (req, res) => {
            const { amount } = req.body;
            try {
                const { walletAddress } = await context.wallet();
                await topup(walletAddress, amount);
                res.json({ message: 'Top up successful' });
            } catch (error) {
                console.log('Error topping up wallet:', error);
                res.status(500).json({
                    error: 'Error topping up wallet',
                    details: error
                });
            }
        });
    }

    app.post('/token', async (req, res) => {
        try {
            const tokenId = await withContext(
                'tmp/boot',
                'log',
                context,
                async context => await boot(context)
            );
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
            const indexerStatus = await context.indexerStatus();
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
            const token = await withTokens(tokens =>
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
                ...token.state,
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
            const tx = await withContext(
                'tmp/update',
                'log',
                context,
                async context => await update(context, tokenId, refs)
            );
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
            const tx = await withContext(
                'tmp/end',
                'log',
                context,
                async context => await end(context, tokenId)
            );

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
            const ref = await withContext(
                'tmp/request',
                'log',
                context,
                async context => {
                    const ref = await request(
                        context,
                        tokenId,
                        key,
                        value,
                        operation
                    );
                    return mkOutputRefId(ref);
                }
            );
            res.json(ref);
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
            const tx = await withContext(
                'tmp/retract',
                'log',
                context,
                async context => await retract(context, { txHash, outputIndex })
            );
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
            const facts = await withContext(
                'tmp/facts',
                'log',
                context,
                async context => await context.facts(tokenId)
            );
            res.json(facts);
        } catch (error) {
            res.status(500).json({
                error: 'Error fetching facts',
                details: error.message
            });
        }
    });

    return app;
}

type Service = {
    server: Server;
    indexer: Indexer;
};

export type Name = {
    name: string;
    port: number;
};

export async function runServices(
    dbPath: string,
    names: Name[],
    ctxProvider: ContextProvider,
    mkWallet: (Provider) => MeshWallet,
    ogmios: string
) {
    const servers: Service[] = [];
    for (const { port, name } of names) {
        const dbPathWithPort = `${dbPath}/${port}`;
        try {
            const wallet = mkWallet(ctxProvider.provider);
            const tries = await TrieManager.create(dbPathWithPort);

            const { address, policyId } = getCagingScript();

            const indexer = Indexer.create(
                tries,
                dbPathWithPort,
                address,
                policyId,
                ogmios,
                name
            );
            new Promise(async () => {
                await indexer.run();
            });

            const context = await newContext(indexer, ctxProvider, wallet);
            const app = mkAPI(ctxProvider.topup, context);

            const server = await new Promise<Server>((resolve, reject) => {
                const srv = app.listen(port, () => {
                    resolve(srv);
                });
                srv.on('error', err => {
                    console.error(
                        `Error starting server on port ${port}:`,
                        err
                    );
                    reject(err);
                });
            });
            servers.push({ server, indexer });
        } catch (error) {
            console.error(`Failed to start service on port ${port}:`, error);
            throw error;
        }
    }
    return servers;
}

export async function stopServices(servers: Service[]) {
    return Promise.all(
        servers.map(({ server, indexer }) => {
            return new Promise<void>((resolve, reject) => {
                indexer.close();
                server.close(err => {
                    if (err) {
                        console.error('Error stopping server:', err);
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        })
    );
}
