export type Stashable<T> = {
    get: () => T | undefined;
    set: (value: T) => void;
    hide: () => void;
    unhide: () => void;
};

export const createStashable = <T>(initialValue: T): Stashable<T> => {
    let value: T | undefined = initialValue;
    let hidden = false;

    return {
        get: () => (hidden ? undefined : value),
        set: (newValue: T) => {
            value = newValue;
            hidden = false;
        },
        hide: () => {
            hidden = true;
        },
        unhide: () => {
            hidden = false;
        }
    };
};

export const collectStashables = <T>(stashables: Stashable<T>[]): T[] => {
    return stashables.reduce((acc, stashable) => {
        const value = stashable.get();
        if (value !== undefined) {
            acc.push(value);
        }
        return acc;
    }, [] as T[]);
};
