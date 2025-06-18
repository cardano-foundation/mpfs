import axios from 'axios';
import { assertThrows } from './test/E2E/lib';

type Log = (s: string) => void;

const sync = async (host: string, blocks: number) => {
    const response = await axios.post(`${host}/indexer/wait-blocks`, {
        n: blocks
    });
};

async function getWallet(host: string) {
    const response = await axios.get(`${host}/wallet`);
    assertThrows(response.status === 200, 'Failed to get wallet');
    assertThrows(
        response.data.walletAddress.slice(0, 4) == 'addr',
        'Address is not present'
    );
    return response.data;
}

async function walletTopup(host: string) {
    const response = await axios.put(`${host}/wallet/topup`, {
        amount: 10000
    });
    assertThrows(response.status === 200, 'Failed to top up wallet');
    assertThrows(
        response.data.message === 'Top up successful',
        'Top up message is not valid'
    );
    return response.data;
}
async function getTokens(log: Log, host: string, blocks = 2) {
    await sync(host, blocks);
    const response = await axios.get(`${host}/tokens`);
    assertThrows(response.status === 200, 'Failed to get tokens');
    return response.data;
}

async function bootTokenTx(host: string, address, blocks = 2) {
    await sync(host, blocks);
    const response = await axios.get(
        `${host}/transaction/${address}/boot-token`
    );
    assertThrows(response.status === 200, 'Failed to create token transaction');
    return response.data;
}

async function createToken(log, host: string, blocks = 2) {
    await sync(host, blocks);
    const response = await axios.post(`${host}/token`);
    assertThrows(response.status === 200, 'Failed to create token');
    return response.data.tokenId;
}

async function getToken(log: Log, host: string, tokenId: string, blocks = 2) {
    await sync(host, blocks);
    const response = await axios.get(`${host}/token/${tokenId}`);
    assertThrows(response.status === 200, 'Failed to get token');
    return response.data;
}

async function deleteToken(
    log: Log,
    host: string,
    tokenId: string,
    blocks = 2
) {
    await sync(host, blocks);
    const response = await axios.delete(`${host}/token/${tokenId}`);
    assertThrows(response.status === 200, 'Failed to delete token');

    return response.data.txHash;
}

async function endTokenTx(
    host: string,
    address: string,
    tokenId: string,
    blocks = 2
) {
    await sync(host, blocks);
    const response = await axios.get(
        `${host}/transaction/${address}/end-token/${tokenId}`
    );
    assertThrows(response.status === 200, 'Failed to end token transaction');
    return response.data;
}

async function updateToken(
    log: (s: string) => void,
    host: string,
    tokenId: string,
    requestIds: string[],
    blocks = 2
) {
    await sync(host, blocks);

    const response = await axios.put(`${host}/token/${tokenId}`, {
        requestIds
    });
    assertThrows(response.status === 200, 'Failed to update token');
    assertThrows(
        response.data.txHash.length === 64,
        'Transaction hash is not valid'
    );
    return response.data.txHash;
}

async function getTokenFacts(
    log: Log,
    host: string,
    tokenId: string,
    blocks = 2
) {
    await sync(host, blocks);
    const response = await axios.get(`${host}/token/${tokenId}/facts`);
    assertThrows(response.status === 200, 'Failed to get facts');
    return response.data;
}
async function createRequest(
    log,
    host: string,
    tokenId: string,
    key: string,
    value: string,
    op: 'insert' | 'delete',
    blocks = 2
) {
    await sync(host, blocks);
    const response = await axios.post(`${host}/token/${tokenId}/request`, {
        key,
        value,
        operation: op
    });
    assertThrows(response.status === 200, 'Failed to create request');
    return response.data;
}

async function deleteRequest(
    log: Log,
    host: string,
    outputRefId: string,
    blocks = 2
) {
    await sync(host, blocks);
    const response = await axios.delete(`${host}/request/${outputRefId}`);
    assertThrows(response.status === 200, 'Failed to delete request');
    assertThrows(
        response.data.txHash.length === 64,
        'Transaction hash is not valid'
    );
    return response.data.txHash;
}

export {
    createRequest,
    deleteRequest,
    getWallet,
    walletTopup,
    getTokens,
    createToken,
    getToken,
    deleteToken,
    updateToken,
    getTokenFacts,
    sync,
    bootTokenTx,
    endTokenTx
};
