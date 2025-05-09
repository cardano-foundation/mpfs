import http, { get } from 'http';
import readline from 'readline';
import {
    createRequest,
    createToken,
    deleteRequest,
    deleteToken,
    getToken,
    getTokens,
    getWallet,
    updateToken,
    walletTopup
} from './client';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { OutputRef } from '../../../lib';

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
    'create-token',
    'get-token',
    'delete-token',
    'update-token',
    'retract-request',
    'create-insert-request',
    'create-delete-request',
    'get-requests'
];

const commandHistory: string[] = [];

const showHistory = () => {
    console.log('Command History:');
    commandHistory.forEach((cmd, index) => {
        console.log(`${index + 1}: ${cmd}`);
    });
};

commands.push('history');

const historyFilePath = './mpfs-history.txt';

// Load history from file if it exists
if (fs.existsSync(historyFilePath)) {
    const savedHistory = fs
        .readFileSync(historyFilePath, 'utf-8')
        .split('\n')
        .filter(line => line.trim() !== '');
    commandHistory.push(...savedHistory);
    console.log('Loaded command history from file.');
}

rl.history = commandHistory;

// Save history to file on exit
rl.on('close', () => {
    fs.writeFileSync(historyFilePath, commandHistory.join('\n'), 'utf-8');
    console.log('Command history saved.');
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

let host = 'http://localhost:3000';
let token: string | undefined = undefined;

async function tokenRequests() {
    if (!token) {
        console.log('No token set. Please set a token first.');
        return;
    }
    const tokenValue = await getToken(host, token);
    if (!tokenValue) {
        console.log('Token not found.');
        return;
    }
    const requests = tokenValue.requests.map((request: any) => {
        return request.ref;
    });
    return requests;
}

const promptUser = () => {
    rl.question('> ', async command => {
        try {
            const tokensResponse = await getTokens(host);
            const parts = command.split(' ');
            switch (parts[0]) {
                case 'help':
                    console.log('Available commands:', commands.join(', '));
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
                    logColorfulJSON(tokensResponse);
                    commandHistory.push(command);
                    break;
                case 'create-token':
                    const createTokenResponse = await createToken(host);
                    token = createTokenResponse.tokenId;
                    logColorfulJSON(createTokenResponse);
                    commandHistory.push(command);
                    break;
                case 'get-token':
                    if (!token) {
                        console.log('No token set. Please set a token first.');
                        break;
                    }
                    const tokenResponse = await getToken(host, token);
                    logColorfulJSON(tokenResponse);
                    commandHistory.push(command);
                    break;
                case 'delete-token':
                    if (!token) {
                        console.log('No token set. Please set a token first.');
                        break;
                    }
                    const deleteTokenResponse = await deleteToken(host, token);
                    logColorfulJSON(deleteTokenResponse);
                    commandHistory.push(command);
                    break;
                case 'update-token':
                    if (!token) {
                        console.log('No token set. Please set a token first.');
                        break;
                    }
                    const updateTokenResponse = await updateToken(
                        host,
                        token,
                        await tokenRequests()
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
                        const key = parts[1].split(',');
                        if (parts[2]) {
                            const value = parts[2];
                            const response = await createRequest(
                                host,
                                token,
                                key,
                                value,
                                'insert'
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
                                host,
                                token,
                                key,
                                value,
                                'delete'
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
                    if (tokensResponse.length === 0) {
                        console.log('No tokens available.');
                        break;
                    }

                    console.log('Available tokens:');
                    tokensResponse.forEach((token: any, index: number) => {
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
                                        tokenRef >= tokensResponse.length
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
                    token = tokensResponse[tokenRef].tokenId;
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

                    const response = await deleteRequest(host, token!, request);
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
