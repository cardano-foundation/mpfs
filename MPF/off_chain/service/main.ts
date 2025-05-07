import { generateMnemonic, MeshWallet } from '@meshsdk/core';
import { validatePort } from '../lib';
import { runServices, stopServices } from './http';
import {
    blockfrostProvider,
    ContextProvider,
    Provider,
    yaciProvider
} from '../context';
import fs from 'fs';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

let servers;

async function setup() {
    try {
        const argvPromise = yargs(hideBin(process.argv))
            .option('port', {
                type: 'number',
                demandOption: true,
                describe: 'Port number for the server'
            })
            .option('provider', {
                type: 'string',
                choices: ['blockfrost', 'yaci'],
                demandOption: true,
                describe: 'Provider to use (blockfrost or yaci)'
            })
            .option('seed', {
                type: 'string',
                demandOption: true,
                describe: 'Path to the seed file'
            })
            .option('generate', {
                alias: 'g',
                type: 'boolean',
                describe: 'Generate a new seed file'
            })
            .option('blockfrost-project-id', {
                type: 'string',
                describe:
                    'Blockfrost project ID (required if provider is blockfrost)'
            })
            .option('yaci-store-port', {
                type: 'number',
                describe: 'Yaci store port (required if provider is yaci)'
            })
            .option('yaci-admin-port', {
                type: 'number',
                describe: 'Yaci admin port (required if provider is yaci)'
            })
            .check(argv => {
                if (
                    argv.provider === 'blockfrost' &&
                    !argv['blockfrost-project-id']
                ) {
                    throw new Error(
                        '--blockfrost-project-id is required when provider is blockfrost'
                    );
                }
                if (
                    argv.provider === 'yaci' &&
                    (!argv['yaci-store-port'] || !argv['yaci-admin-port'])
                ) {
                    throw new Error(
                        '--yaci-store-port and --yaci-admin-port are required when provider is yaci'
                    );
                }
                return true;
            }).argv;

        const argv = await argvPromise;

        const portNumber = validatePort(argv.port.toString(), '--port');

        if (argv.generate) {
            const mnemonic = generateMnemonic();
            fs.writeFileSync(argv.seed, mnemonic);
            console.log(`Seed file generated at ${argv.seed}`);
        }
        const mnemonic = fs.readFileSync(argv.seed, 'utf8');

        const mkWallet = provider =>
            new MeshWallet({
                networkId: 0,
                fetcher: provider,
                submitter: provider,
                key: {
                    type: 'mnemonic',
                    words: mnemonic.split(' ')
                }
            });

        let ctxProvider: ContextProvider;

        switch (argv.provider) {
            case 'blockfrost':
                const blockfrostProjectId = argv['blockfrost-project-id'];
                if (!blockfrostProjectId) {
                    throw new Error('Blockfrost project ID is required');
                }
                ctxProvider = blockfrostProvider(blockfrostProjectId);
                break;
            case 'yaci':
                if (!argv['yaci-store-port'] || !argv['yaci-admin-port']) {
                    throw new Error('Yaci store and admin ports are required');
                }
                const yaciStorePort = validatePort(
                    argv['yaci-store-port'].toString(),
                    '--yaci-store-port'
                );
                const yaciAdminPort = validatePort(
                    argv['yaci-admin-port'].toString(),
                    '--yaci-admin-port'
                );
                ctxProvider = yaciProvider(yaciStorePort, yaciAdminPort);
                break;
            default:
                throw new Error('Invalid provider specified');
        }
        return { portNumber, ctxProvider, mkWallet };
    } catch (error) {
        console.error('Error in setup:', error.message);
        process.exit(1);
    }
}

async function main() {
    const { portNumber, ctxProvider, mkWallet } = await setup();
    servers = await runServices([portNumber], ctxProvider, mkWallet);
    console.log(`Server is running on port ${portNumber}`);

    process.on('SIGINT', async () => {
        console.log('Received SIGINT. Shutting down...');
        await stopServices(servers);
        console.log('Server stopped');
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        console.log('Received SIGTERM. Shutting down...');
        await stopServices(servers);
        console.log('Server stopped');
        process.exit(0);
    });
}

await main();
