import express from 'express';
import { Context, mkContext } from '../../transactions/context';
import { bootTransaction } from '../../transactions/boot';
import { requestTx } from '../../transactions/request';
import { endTransaction } from '../../transactions/end';
import { Server } from 'http';
import { createTrieManager } from '../../trie';
import { createIndexer, Indexer } from '../../indexer/indexer';
import { Level } from 'level';
import { Token, withRefIds } from '../../indexer/state/tokens';
import { createState } from '../../indexer/state';
import { createProcess } from '../../indexer/process';
import { sleep } from '../../lib';
import { Checkpoint } from '../../indexer/state/checkpoints';
import {
    getCagingScript,
    Provider,
    topup,
    TopUp
} from '../../transactions/context/lib';
import { updateTransaction } from '../../transactions/update';
import { unmkOutputRefId } from '../../outputRef';
import swaggerUi from 'swagger-ui-express';
import * as openApiSpec from './public/openapi.json';
import { fileURLToPath } from 'url';
import path from 'path';
import blueprint from '../../plutus.json';
import { retractTransaction } from '../../transactions/retract';

const swagger = app => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    app.use(
        '/api-docs',
        swaggerUi.serve,
        swaggerUi.setup(openApiSpec, {
            customCssUrl: '../public/swagger.css',
            customSiteTitle: 'MPFS API Documentation',
            customfavIcon: '../public/logo.png'
        })
    );
    app.use('/public', express.static(path.join(__dirname, 'public')));
    app.get('/', (req, res) => {
        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>MPFS</title>
            <style>
                body {
                 max-width: 500px;
                 margin: 0 auto;
                background-color: rgb(22, 26, 34);
                color: white;
                text-align: center;
                font-family: Arial, sans-serif;
                margin-top: 20px;
                }
                a {
                color: lightblue;
                }
                li {
                list-style: none;
                }
                h1 {
                font-size: 42px;
                margin-bottom: 20px;
                text-shadow: 2px 2px 4px rgba(51, 42, 42, 0.5);
                }
                footer {
                border-top: 1px solid gray;
                padding-top: 10px;
                font-size: 0.8em;
                color: gray;
                }
                .links {
                border-top: 1px solid gray;
                padding-top: 10px;
                }
            </style>
            </head>
            <body>
            <img src="/public/logo.png" alt="Logo" style="width: 310px; height: auto;">
            <h1>MPFS</h1>
            <h4>Merkle Patricia Forestry Service</h4>
            <div class="links">
                <p>A project by <a href="https://www.cardanofoundation.org/" target="_blank">Cardano Foundation</a></p>
                <p>Open sourced on <a href="https://app.radicle.xyz/nodes/ash.radicle.garden/rad:zpZ4szHxvnyVyDiy2acfcVEzxza9" target="_blank">Radicle</a></p>
                <p>API documentation <a href="/api-docs">Swagger</a></p>
            </div>
            <footer>
                <p>Powered by:</p>
                <ul>
                <li><a href="https://github.com/MeshJS/mesh" target="_blank">Mesh SDK</a> - A JavaScript SDK for Cardano</li>
                <li><a href="https://ogmios.dev/" target="_blank">Ogmios</a> - A Cardano node web-socket interface</li>
                <li><a href="https://github.com/aiken-lang/merkle-patricia-forestry" target="_blank">Merkle Patricia Forestry</a> - A library for managing Merkle Patricia trees</li>
                <li><a href="https://github.com/bloxbean/yaci-store" target="_blank">Yaci Store</a> - A node-to-node indexer for the Cardano network</li>
                </ul>
            </footer>
            </body>
            </html>
        `);
    });
};

// API Endpoints
function mkAPI(topup: TopUp | undefined, context: Context) {
    async function withTokens(f: (tokens: Token[]) => any): Promise<any> {
        const tokens = await context.fetchTokens();
        return f(tokens);
    }

    const app = express();

    app.use(express.json()); // Ensure JSON parsing middleware is applied
    // Middleware to log HTTP requests
    // app.use((req, res, next) => {
    //     console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    //     next();
    // });

    swagger(app);

    app.get('/transaction/:address/boot-token', async (req, res) => {
        const { address } = req.params;
        try {
            const { unsignedTransaction, value: tokenId } =
                await bootTransaction(context, address);
            res.json({
                unsignedTransaction,
                tokenId
            });
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
                tokens: tokens.map(withRefIds),
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
                ...withRefIds(token).current,
                requests
            });
        } catch (error) {
            res.status(500).json({
                error: 'Error fetching token',
                details: error.message
            });
        }
    });

    app.get('/transaction/:address/end-token/:tokenId', async (req, res) => {
        const { tokenId, address } = req.params;
        try {
            const { unsignedTransaction } = await endTransaction(
                context,
                address,
                tokenId
            );
            res.json({ unsignedTransaction });
        } catch (error) {
            res.status(500).json({
                error: 'Error creating end transaction',
                details: error.message
            });
        }
    });

    app.get(
        '/transaction/:address/request-insert/:tokenId',
        async (req, res) => {
            const { tokenId, address } = req.params;
            const key = req.query.key as string;
            const value = req.query.value as string;
            try {
                const { unsignedTransaction } = await requestTx(
                    context,
                    address,
                    tokenId,
                    { key, value, type: 'insert' }
                );
                res.json({ unsignedTransaction });
            } catch (error) {
                res.status(500).json({
                    error: 'Error creating request-insert transaction',
                    details: error.message
                });
            }
        }
    );
    app.get(
        '/transaction/:address/request-delete/:tokenId',
        async (req, res) => {
            const { tokenId, address } = req.params;
            const key = req.query.key as string;
            const value = req.query.value as string;
            try {
                const { unsignedTransaction } = await requestTx(
                    context,
                    address,
                    tokenId,
                    { key, value, type: 'delete' }
                );
                res.json({ unsignedTransaction });
            } catch (error) {
                res.status(500).json({
                    error: 'Error creating request-delete transaction',
                    details: error.message
                });
            }
        }
    );

    app.get(
        '/transaction/:address/request-update/:tokenId',
        async (req, res) => {
            const { tokenId, address } = req.params;
            const key = req.query.key as string;
            const oldValue = req.query.oldValue as string;
            const newValue = req.query.newValue as string;
            try {
                const { unsignedTransaction } = await requestTx(
                    context,
                    address,
                    tokenId,
                    { key, oldValue, newValue, type: 'update' }
                );
                res.json({ unsignedTransaction });
            } catch (error) {
                res.status(500).json({
                    error: 'Error creating request-update transaction',
                    details: error.message
                });
            }
        }
    );

    app.get('/transaction/:address/update-token/:tokenId', async (req, res) => {
        const { tokenId, address } = req.params;
        const requests = req.query.request;
        const requireds = (
            Array.isArray(requests) ? requests : [requests].filter(Boolean)
        ) as string[];

        try {
            const { unsignedTransaction, value: mpfRoot } =
                await updateTransaction(
                    context,
                    address,
                    tokenId,
                    requireds.map(ref => unmkOutputRefId(ref))
                );
            res.json({
                unsignedTransaction,
                mpfRoot
            });
        } catch (error) {
            res.status(500).json({
                error: 'Error creating update transaction',
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

    app.post('/transaction', async (req, res) => {
        const { signedTransaction } = req.body;
        try {
            const txHash = await context.submitTx(signedTransaction);
            res.status(200).json({ txHash });
        } catch (error) {
            res.status(500).json({
                error: 'Error submitting transaction',
                details: error.message
            });
        }
    });

    app.get('/config', async (req, res) => {
        res.json({
            address: context.cagingScript.address,
            policyId: context.cagingScript.policyId,
            plutus: blueprint
        });
    });

    app.get(
        '/transaction/:address/retract-change/:requestId',
        async (req, res) => {
            const { address, requestId } = req.params;
            try {
                const outputRef = unmkOutputRefId(requestId);
                const { unsignedTransaction } = await retractTransaction(
                    context,
                    address,
                    outputRef
                );
                res.json({ unsignedTransaction });
            } catch (error) {
                console.error('Error creating retract transaction:', error);
                res.status(500).json({
                    error: 'Error creating retract transaction',
                    details: error.message
                });
            }
        }
    );

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
                ogmios,
                provider,
                null, // No signing wallet
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
                throw error;
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
            ogmios,
            since,
            async () => await loop(remainingNames)
        );
    }
    await loop(names);
}
