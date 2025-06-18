import readline from 'readline';
import {
    createRequest,
    createToken,
    deleteRequest,
    deleteToken,
    getToken,
    getTokens,
    getWallet,
    sync,
    updateToken,
    walletTopup
} from '../client';
import fs from 'fs';
import chalk from 'chalk';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    completer: (line: string) => {
        const hits = commands.filter(cmd => cmd.startsWith(line)); // Filter commands that match the input
        return [hits.length ? hits : commands, line]; // Return matches or all commands if no match
    }
});

const commands = [
    'set-host',
    'get-wallet',
    'topup-wallet',
    'get-tokens',
    'set-token',
    'boot-token',
    'get-token',
    'delete-token',
    'update-token',
    'retract-request',
    'create-insert-request',
    'create-delete-request',
    'get-requests',
    'sync'
];

const commandHistory: string[] = [];

const showHistory = () => {
    console.log('Command History:');
    commandHistory.forEach((cmd, index) => {
        console.log(`${index + 1}: ${cmd}`);
    });
};

commands.push('indexer');

const historyFilePath = './mpfs-indexer.txt';

// Load indexer from file if it exists
if (fs.existsSync(historyFilePath)) {
    const savedHistory = fs
        .readFileSync(historyFilePath, 'utf-8')
        .split('\n')
        .filter(line => line.trim() !== '');
    commandHistory.push(...savedHistory);
    console.log('Loaded command indexer from file.');
}

rl.indexer = commandHistory;

// Save indexer to file on exit
rl.on('close', () => {
    fs.writeFileSync(historyFilePath, commandHistory.join('\n'), 'utf-8');
    console.log('Command indexer saved.');
    process.exit(0);
});
const logColorfulJSON = (data: any) => {
    const jsonString = JSON.stringify(data, null, 2);
    const colorfulJSON = jsonString.replace(/"([^"]+)":/g, (_, key) =>
        chalk.blue(`"${key}":`)
    ); // Keys in blue

    console.log(colorfulJSON);
};
const logJSON = (data: any) => {
    console.log(JSON.stringify(data, null, 2));
};

let host = 'http://localhost:3220';
let token: string | undefined = undefined;

const logConsole = (message: string) => {
    console.log(chalk.green(message));
};
async function tokenRequests() {
    if (!token) {
        console.log('No token set. Please set a token first.');
        return;
    }
    const tokenValue = await getToken(logConsole, host, token);
    if (!tokenValue) {
        console.log('Token not found.');
        return;
    }
    const requests = tokenValue.requests.map((request: any) => {
        return request.outputRef;
    });
    return requests;
}

const promptUser = () => {
    rl.question('> ', async command => {
        try {
            const tokensResponse = async () =>
                await getTokens(logConsole, host, 0);
            const parts = command.split(' ');
            switch (parts[0]) {
                case 'help':
                    console.log('Available commands:', commands.join(', '));
                    commandHistory.push(command);
                    break;
                case 'sync':
                    if (parts[1]) {
                        const blocks = parseInt(parts[1]);
                        if (isNaN(blocks) || blocks <= 0) {
                            console.log(
                                'Please provide a valid number of blocks.'
                            );
                        } else {
                            console.log(`Syncing ${blocks} blocks...`);
                            // Assuming sync is a function that takes host and seconds
                            await sync(host, blocks);
                            console.log(`Synced ${blocks} blocks.`);
                        }
                    } else {
                        console.log(
                            'Please provide the number of seconds to sync.'
                        );
                    }
                    commandHistory.push(command);
                    break;
                case 'set-host':
                    if (parts[1]) {
                        host = 'http://localhost:' + parts[1];
                        console.log(`Host set to ${host}`);
                    } else {
                        console.log('Please provide a host port.');
                    }
                    commandHistory.push(command);
                    break;
                case 'get-wallet':
                    const w = await getWallet(host);
                    logColorfulJSON(w);
                    commandHistory.push(command);
                    break;
                case 'topup-wallet':
                    const topupResponse = await walletTopup(host);
                    logColorfulJSON(topupResponse);
                    commandHistory.push(command);
                    break;
                case 'get-tokens':
                    logColorfulJSON(await tokensResponse());
                    commandHistory.push(command);
                    break;
                case 'boot-token':
                    const createTokenResponse = await createToken(
                        logConsole,
                        host,
                        0
                    );
                    token = createTokenResponse.tokenId;
                    logColorfulJSON(createTokenResponse);
                    commandHistory.push(command);
                    break;
                case 'get-token':
                    if (!token) {
                        console.log('No token set. Please set a token first.');
                        break;
                    }
                    const tokenResponse = await getToken(
                        logConsole,
                        host,
                        token,
                        0
                    );
                    logColorfulJSON(tokenResponse);
                    commandHistory.push(command);
                    break;
                case 'delete-token':
                    if (!token) {
                        console.log('No token set. Please set a token first.');
                        break;
                    }
                    const deleteTokenResponse = await deleteToken(
                        logConsole,
                        host,
                        token,
                        0
                    );
                    logColorfulJSON(deleteTokenResponse);
                    commandHistory.push(command);
                    break;
                case 'update-token':
                    if (!token) {
                        console.log('No token set. Please set a token first.');
                        break;
                    }
                    const updateTokenResponse = await updateToken(
                        logConsole,
                        host,
                        token,
                        await tokenRequests(),
                        0
                    );
                    logColorfulJSON(updateTokenResponse);
                    commandHistory.push(command);
                    break;
                case 'create-insert-request':
                    if (!token) {
                        console.log('No token set. Please set a token first.');
                        break;
                    }
                    if (parts[1]) {
                        let value;
                        if (parts[2]) {
                            value = parts[2];
                        } else {
                            value = '';
                        }
                        const response = await createRequest(
                            logConsole,
                            host,
                            token,
                            parts[1],
                            value,
                            'insert',
                            0
                        );
                        logColorfulJSON(response);
                        commandHistory.push(command);
                    } else {
                        console.log('Please provide a key.');
                    }
                    break;
                case 'create-delete-request':
                    if (!token) {
                        console.log('No token set. Please set a token first.');
                        break;
                    }
                    if (parts[1]) {
                        const key = parts[1].split(',');
                        if (parts[2]) {
                            const value = parts[2];
                            const response = await createRequest(
                                logConsole,
                                host,
                                token,
                                parts[1],
                                value,
                                'delete',
                                0
                            );
                            logColorfulJSON(response);
                            commandHistory.push(command);
                        } else {
                            console.log('Please provide a value.');
                        }
                    } else {
                        console.log('Please provide a key.');
                    }
                    break;
                case 'set-token':
                    if (parts[1]) {
                        token = parts[1];
                        console.log(`Token set to ${token}`);
                        commandHistory.push(command);
                        break;
                    }
                    const tokens = await tokensResponse();
                    console.log(JSON.stringify(tokens, null, 2));
                    if (tokens.tokens.length === 0) {
                        console.log('No tokens available.');
                        break;
                    }

                    console.log('Available tokens:');
                    tokens.tokens.forEach((token: any, index: number) => {
                        console.log(`${index}: ${token.tokenId}`);
                    });

                    const getTokenReference = async (): Promise<
                        number | undefined
                    > => {
                        return new Promise(resolve => {
                            rl.question(
                                'Enter token reference to select: ',
                                ref => {
                                    const tokenRef = parseInt(ref);
                                    if (
                                        isNaN(tokenRef) ||
                                        tokenRef < 0 ||
                                        tokenRef >= tokens.length
                                    ) {
                                        console.log('Invalid token reference.');
                                        resolve(undefined);
                                    } else {
                                        resolve(tokenRef);
                                    }
                                }
                            );
                        });
                    };
                    const tokenRef = await getTokenReference();
                    if (tokenRef === undefined) {
                        break;
                    }
                    token = tokens.tokens[tokenRef].tokenId;
                    console.log(`Token set to ${token}`);
                    commandHistory.push(command);
                    break;
                case 'retract-request':
                    if (!token) {
                        console.log('No token set. Please set a token first.');
                        break;
                    }

                    const requests = await tokenRequests();
                    if (requests.length === 0) {
                        console.log('No requests found.');
                        break;
                    }

                    console.log('Available requests:');
                    requests.forEach((request: any, index: number) => {
                        console.log(`${index}: ${JSON.stringify(request)}`);
                    });

                    const getRequestReference = async (): Promise<
                        number | undefined
                    > => {
                        return new Promise(resolve => {
                            rl.question(
                                'Enter request reference to retract: ',
                                ref => {
                                    const requestRef = parseInt(ref);
                                    if (
                                        isNaN(requestRef) ||
                                        requestRef < 0 ||
                                        requestRef >= requests.length
                                    ) {
                                        console.log(
                                            'Invalid request reference.'
                                        );
                                        resolve(undefined);
                                    } else {
                                        resolve(requestRef);
                                    }
                                }
                            );
                        });
                    };

                    const requestRef = await getRequestReference();
                    if (requestRef === undefined) {
                        break;
                    }

                    const request = requests[requestRef];
                    if (!request) {
                        console.log('No request found.');
                        break;
                    }

                    const response = await deleteRequest(
                        logConsole,
                        host,
                        request,
                        0
                    );
                    logColorfulJSON(response);
                    commandHistory.push(command);
                    break;
            }
        } catch (error) {
            console.error('Error:', error.message);
            commandHistory.push(command);
            promptUser(); // Prompt again after error}
        }
        // Here you can add logic to handle each command

        promptUser(); // Recursively prompt the user
    });
};

promptUser();
