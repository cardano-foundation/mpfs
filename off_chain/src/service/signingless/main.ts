import { validatePort } from '../../lib';
import { withService } from './http';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { RollbackKey } from '../../indexer/state/rollbackkey';
import {
    blockfrostProvider,
    Provider,
    yaciProvider
} from '../../transactions/context/lib';

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
            .option('blockfrost-project-id', {
                type: 'string',
                describe:
                    'Blockfrost project ID (required if provider is blockfrost)'
            })
            .option('yaci-store-host', {
                type: 'string',
                describe: 'Yaci store host (required if provider is yaci)'
            })
            .option('yaci-admin-host', {
                type: 'string',
                describe: 'Yaci admin host'
            })
            .option('ogmios-host', {
                type: 'string',
                describe: 'Ogmios service URL (default: http://localhost:1337)',
                default: 'http://localhost:1337'
            })
            .option('database-path', {
                type: 'string',
                describe: 'Path to the database directory',
                default: 'tmp'
            })
            .option('logs-path', {
                type: 'string',
                describe: 'Path to the logs directory',
                default: 'tmp'
            })
            .option('since-slot', {
                type: 'number',
                describe: 'Slot number to start indexing from',
                default: 0
            })
            .option('since-block-id', {
                type: 'string',
                describe: 'Block ID to start indexing from',
                default: ''
            }).argv;

        const argv = await argvPromise;

        const portNumber = validatePort(argv.port.toString(), '--port');

        let provider: Provider;

        switch (argv.provider) {
            case 'blockfrost':
                const blockfrostProjectId = argv['blockfrost-project-id'];
                if (!blockfrostProjectId) {
                    throw new Error('Blockfrost project ID is required');
                }
                provider = blockfrostProvider(blockfrostProjectId);
                break;
            case 'yaci':
                const yaciStoreHost = argv['yaci-store-host'];
                const yaciAdminHost = argv['yaci-admin-host'];
                if (!yaciStoreHost) {
                    throw new Error('Yaci store host is required');
                }

                provider = yaciProvider(yaciStoreHost, yaciAdminHost);
                break;
            default:
                throw new Error('Invalid provider specified');
        }
        return {
            portNumber,
            provider,
            ogmios: argv['ogmios-host'],
            database: argv['database-path'],
            logs: argv['logs-path'],
            since:
                argv['since-slot'] === 0
                    ? null
                    : {
                          slot: new RollbackKey(parseInt(argv['since-slot'])),
                          id: argv['since-block-id']
                      }
        };
    } catch (error) {
        console.error('Error in setup:', error.message);
        process.exit(1);
    }
}

async function main() {
    const { portNumber, provider, ogmios, database, logs, since } =
        await setup();
    await withService(
        portNumber,
        logs,
        database,
        provider,
        ogmios,
        since,
        async () => {
            console.log(`Server is running on port ${portNumber}`);
            console.log('Press Ctrl+C to stop the server');
            await new Promise<void>(resolve => {
                process.on('SIGINT', () => {
                    console.log('Shutting down server...');
                    resolve();
                });
            });
        }
    );
}

await main();
