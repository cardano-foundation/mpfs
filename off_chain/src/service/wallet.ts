import { generateMnemonic, MeshWallet } from '@meshsdk/core';
import * as fs from 'fs';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const createWallet = async filename => {
    const mnemonics = generateMnemonic();
    const clientWallet = new MeshWallet({
        networkId: 0,
        key: {
            type: 'mnemonic',
            words: mnemonics.split(' ')
        }
    });

    const address = clientWallet.getChangeAddress();

    const data = { mnemonics: mnemonics, address: address };

    fs.writeFileSync(filename, JSON.stringify(data), 'utf8');
};

const signTransaction = async (filename, transaction) => {
    if (!fs.existsSync(filename)) {
        throw new Error(`Wallet file ${filename} does not exist.`);
    }
    const walletData = JSON.parse(fs.readFileSync(filename, 'utf8'));
    const clientWallet = new MeshWallet({
        networkId: 0,
        key: {
            type: 'mnemonic',
            words: walletData.mnemonics.split(' ')
        }
    });
    const signedTransaction = await clientWallet.signTx(transaction);
    return signedTransaction;
};

yargs(hideBin(process.argv))
    .command(
        'create-wallet <filename>',
        'Create a new wallet and save it to a file',
        yargs => {
            yargs.positional('filename', {
                describe: 'The filename to save the wallet data',
                type: 'string'
            });
        },
        async argv => {
            await createWallet(argv.filename);
        }
    )
    .command(
        'sign-transaction <filename> <transaction>',
        'Sign a transaction using the wallet stored in the file',
        yargs => {
            yargs
                .positional('filename', {
                    describe: 'The filename of the wallet data',
                    type: 'string'
                })
                .positional('transaction', {
                    describe: 'The transaction to sign',
                    type: 'string'
                });
        },
        async argv => {
            const signedTransaction = await signTransaction(
                argv.filename,
                argv.transaction
            );
            console.log(signedTransaction);
        }
    )
    .demandCommand(1, 'You need to specify a command')
    .help().argv;
