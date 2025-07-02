import {
    deserializeAddress,
    generateMnemonic,
    MeshWallet
} from '@meshsdk/core';
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

const revealAddress = async filename => {
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
    const { enterpriseAddressBech32 } = clientWallet.getAddresses();
    if (!enterpriseAddressBech32) {
        throw new Error('No enterprise address found in the wallet.');
    }
    const signerHash = deserializeAddress(enterpriseAddressBech32).pubKeyHash;

    return { enterpriseAddressBech32, signerHash };
};

const signTransaction = async (wallet, file) => {
    if (!fs.existsSync(wallet)) {
        throw new Error(`Wallet file ${wallet} does not exist.`);
    }
    const walletData = JSON.parse(fs.readFileSync(wallet, 'utf8'));
    const clientWallet = new MeshWallet({
        networkId: 0,
        key: {
            type: 'mnemonic',
            words: walletData.mnemonics.split(' ')
        }
    });
    const unsigned = fs.readFileSync(file, 'utf8');
    const signedTransaction = await clientWallet.signTx(unsigned);
    fs.writeFileSync(file, signedTransaction, 'utf8');
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
        'reveal-address <filename>',
        'Reveal the address of the wallet stored in the file',
        yargs => {
            yargs.positional('filename', {
                describe: 'The filename of the wallet data',
                type: 'string'
            });
        },
        async argv => {
            const address = await revealAddress(argv.filename);
            console.log(JSON.stringify(address, null, 2));
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
            await signTransaction(argv.filename, argv.transaction);
        }
    )
    .demandCommand(1, 'You need to specify a command')
    .help().argv;
