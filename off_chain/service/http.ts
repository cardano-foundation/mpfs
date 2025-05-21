import express from 'express';
import { newContext, withContext, ContextProvider, TopUp } from '../context';
import { boot } from '../transactions/boot';
import { update } from '../transactions/update';
import { request } from '../transactions/request';
import { findTokenIdRequests, findTokens } from '../common';
import { end } from '../transactions/end';
import { retract } from '../transactions/retract';
import { Server } from 'http';
import { MeshWallet } from '@meshsdk/core';

// API Endpoints
function mkAPI(topup: TopUp | undefined, context) {
    async function withTokens(f: (tokens: any[]) => any): Promise<any> {
        const tokens = await withContext(
            'tmp/tokens',
            'log',
            context,
            async context => findTokens(context)
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
            const tokens = await withTokens(tokens => tokens);
            res.json(tokens);
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
                res.status(404).json({ error: 'Token not found' });
                return;
            }
            const tokenRequests = await findTokenIdRequests(context, tokenId);

            res.json({
                owner: token.owner,
                root: token.root,
                requests: tokenRequests
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
        const { requests } = req.body;
        try {
            const tx = await withContext(
                'tmp/update',
                'log',
                context,
                async context => await update(context, tokenId, requests)
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
                async context =>
                    request(context, tokenId, key, value, operation)
            );
            res.json(ref);
        } catch (error) {
            res.status(500).json({
                error: 'Error requesting',
                details: error.message
            });
        }
    });

    app.delete(
        '/token/:tokenId/request/:txHash/:outputIndexS',
        async (req, res) => {
            const { tokenId, txHash, outputIndexS } = req.params;
            const outputIndex = parseInt(outputIndexS, 10);
            try {
                const tx = await withContext(
                    'tmp/retract',
                    'log',
                    context,
                    async context =>
                        await retract(context, { txHash, outputIndex })
                );
                res.json({ txHash: tx });
            } catch (error) {
                res.status(500).json({
                    error: 'Error retracting',
                    details: error.message
                });
            }
        }
    );
    return app;
}

export async function runServices(
    ports: number[],
    ctxProvider: ContextProvider,
    mkWallet: (Provider) => MeshWallet
) {
    const servers: Server[] = [];
    for (const port of ports) {
        try {
            const wallet = mkWallet(ctxProvider.provider);
            const context = await newContext(ctxProvider, wallet);
            const app = mkAPI(ctxProvider.topup, context);
            await ctxProvider.topup?.(
                (
                    await context.wallet()
                ).walletAddress,
                10_000
            );
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
            servers.push(server);
        } catch (error) {
            console.error(`Failed to start service on port ${port}:`, error);
            throw error;
        }
    }
    return servers;
}

export async function stopServices(servers: Server[]) {
    return Promise.all(
        servers.map(server => {
            return new Promise<void>((resolve, reject) => {
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
