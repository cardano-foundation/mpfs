import axios from 'axios';
import { assertThrows } from '../test/E2E/lib';

type Log = (s: string) => void;

const sync = async (host: string, blocks: number) => {
    const response = await axios.post(`${host}/indexer/wait-blocks`, {
        n: blocks
    });
};

export async function getTokens(log: Log, host: string, blocks = 2) {
    await sync(host, blocks);
    const response = await axios.get(`${host}/tokens`);
    assertThrows(response.status === 200, 'Failed to get tokens');
    return response.data;
}

export async function bootTokenTx(host: string, address, blocks = 2) {
    await sync(host, blocks);
    const response = await axios.get(
        `${host}/transaction/${address}/boot-token`
    );
    assertThrows(response.status === 200, 'Failed to create token transaction');
    return response.data;
}

export async function getToken(
    log: Log,
    host: string,
    tokenId: string,
    blocks = 2
) {
    await sync(host, blocks);
    const response = await axios.get(`${host}/token/${tokenId}`);
    assertThrows(response.status === 200, 'Failed to get token');
    return response.data;
}

export async function endTokenTx(
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

export async function getTokenFacts(
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

export async function requestChangeTx(
    host: string,
    address: string,
    tokenId: string,
    key: string,
    value: string,
    op: 'insert' | 'delete',
    blocks = 2
): Promise<{ unsignedTransaction: string; value: null }> {
    await sync(host, blocks);
    const response = await axios.get(
        `${host}/transaction/${address}/request-change/${tokenId}`,
        {
            params: {
                key,
                value,
                operation: op
            }
        }
    );
    assertThrows(
        response.status === 200,
        'Failed to create request transaction'
    );
    return response.data;
}

export async function updateTokenTx(
    host: string,
    address: string,
    tokenId: string,
    requireds: string[] = [],
    blocks = 2
): Promise<{ unsignedTransaction: string; value: null }> {
    await sync(host, blocks);
    const params = new URLSearchParams();
    requireds.forEach(item => params.append('request', item));
    const response = await axios.get(
        `${host}/transaction/${address}/update/${tokenId}`,
        { params }
    );
    assertThrows(
        response.status === 200,
        'Failed to create update transaction'
    );
    return response.data;
}

export async function submitTx(
    host: string,
    signedTransaction: string
): Promise<{ txHash: string }> {
    const response = await axios.post(`${host}/transaction`, {
        signedTransaction
    });
    assertThrows(response.status === 200, 'Failed to submit transaction');

    return response.data;
}
