import axios from 'axios';
import { OutputRef } from '../../../lib';
import { assertThrows } from './lib';

async function getWallet(host: string) {
    const response = await axios.get(`${host}/wallet`);
    assertThrows(response.status === 200, 'Failed to get wallet');
    assertThrows(
        response.data.address.slice(0, 4) == 'addr',
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
async function getTokens(host: string) {
    const response = await axios.get(`${host}/tokens`);
    assertThrows(response.status === 200, 'Failed to get tokens');
    return response.data;
}

async function createToken(host: string) {
    const response = await axios.post(`${host}/token`);
    assertThrows(response.status === 200, 'Failed to create token');
    assertThrows(response.data.tokenId.length === 120, 'Token ID is not valid');
    return response.data.tokenId;
}

async function getToken(host: string, tokenId: string) {
    const response = await axios.get(`${host}/token/${tokenId}`);
    assertThrows(response.status === 200, 'Failed to get token');
    return response.data;
}

async function deleteToken(host: string, tokenId: string) {
    const response = await axios.delete(`${host}/token/${tokenId}`);
    assertThrows(response.status === 200, 'Failed to delete token');

    return response.data.txHash;
}

async function updateToken(
    host: string,
    tokenId: string,
    requests: OutputRef[]
) {
    const response = await axios.put(`${host}/token/${tokenId}`, { requests });
    assertThrows(response.status === 200, 'Failed to update token');
    assertThrows(
        response.data.txHash.length === 64,
        'Transaction hash is not valid'
    );
    return response.data.txHash;
}

async function createRequest(
    host: string,
    tokenId: string,
    key: string,
    value: string,
    op: 'insert' | 'delete'
) {
    const response = await axios.post(`${host}/token/${tokenId}/request`, {
        key,
        value,
        operation: op
    });
    assertThrows(response.status === 200, 'Failed to create request');
    assertThrows(
        response.data.txHash.length === 64,
        'Transaction hash is not valid'
    );
    return response.data;
}

async function deleteRequest(host: string, tokenId: string, ref: OutputRef) {
    const response = await axios.delete(
        `${host}/token/${tokenId}/request/${ref.txHash}/${ref.outputIndex}`
    );
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
    updateToken
};
