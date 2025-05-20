
const assertThrows = (cond: boolean, error: string) => {
    if (!cond) {
        throw new Error(error);
    }
};
const notAssertThrows = (cond: boolean, error: string) => {
    if (cond) {
        throw new Error(error);
    }
};
async function shouldFail(x: Promise<any>) {
    try {
        await x;
    } catch (e) {
        return;
    }
    throw new Error('Expected failure but got success');
}
async function catchFailure(
    fn: () => Promise<void>,
    name: string,
    failures: { error: Error, name: string } [] = []
) {
    try {
        await fn();
    } catch (e) {
        console.log(`Error in ${name}:`, e);
        failures.push({
            error: e,
            name
        });
    }
}

export {
    assertThrows,
    notAssertThrows,
    shouldFail,
    catchFailure
};