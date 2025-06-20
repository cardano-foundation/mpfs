import express from 'express';
import { Context, mkContext } from '../../transactions/context';
import { bootTransaction } from '../../transactions/boot';
import { requestTx } from '../../transactions/request';
import { endTransaction } from '../../transactions/end';
import { Server } from 'http';
import { createTrieManager } from '../../trie';
import { createIndexer, Indexer } from '../../indexer/indexer';
import { Level } from 'level';
import { Token } from '../../indexer/state/tokens';
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

const swagger = app => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    app.use(
        '/api-docs',
        swaggerUi.serve,
        swaggerUi.setup(openApiSpec, {
            customCssUrl: '../public/swagger.css'
        })
    );
    app.use('/public', express.static(path.join(__dirname, 'public')));
    app.get('/', (req, res) => {
        res.redirect('/api-docs');
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

    swagger(app);

    app.get('/transaction/:address/boot-token', async (req, res) => {
        const { address } = req.params;
        try {
            res.json(await bootTransaction(context, address));
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

    app.get('/transaction/:address/end-token/:tokenId', async (req, res) => {
        const { tokenId, address } = req.params;
        try {
            res.json(await endTransaction(context, address, tokenId));
        } catch (error) {
            res.status(500).json({
                error: 'Error creating end transaction',
                details: error.message
            });
        }
    });

    app.get('/transaction/:address/request/:tokenId', async (req, res) => {
        const { tokenId, address } = req.params;
        const key = req.query.key as string;
        const value = req.query.value as string;
        const operation = req.query.operation as 'insert' | 'delete';
        if (!key || !value || !operation) {
            res.status(400).json({
                error: 'Missing required query parameters: key, value, operation'
            });
            return;
        }
        try {
            const { unsignedTransaction } = await requestTx(
                context,
                address,
                tokenId,
                key,
                value,
                operation
            );
            res.json({ unsignedTransaction });
        } catch (error) {
            res.status(500).json({
                error: 'Error creating request transaction',
                details: error.message
            });
        }
    });
    app.get('/transaction/:address/update/:tokenId', async (req, res) => {
        const { tokenId, address } = req.params;
        const requests = req.query.request;
        const requireds = (
            Array.isArray(requests) ? requests : [requests].filter(Boolean)
        ) as string[];

        try {
            const result = await updateTransaction(
                context,
                address,
                tokenId,
                requireds.map(ref => unmkOutputRefId(ref))
            );
            res.json(result);
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
            console.error('Error submitting transaction:', error);
            res.status(500).json({
                error: 'Error submitting transaction',
                details: error.message
            });
        }
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
