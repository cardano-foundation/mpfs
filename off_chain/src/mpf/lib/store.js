import assert from 'node:assert';
import { Level } from 'level';
import { NULL_HASH } from './helpers.js';

export class Store {
  #batch;
  #db;
    constructor(id, parent) {
        if (id && parent && parent.sublevel && typeof parent.sublevel === 'function') {
            this.#db = parent.sublevel(id, { valueEncoding: 'json' });
            return;
        }
        else {
            if (parent === undefined) {
                this.#db = inMemoryMap();
            } else {
                this.#db = new Level(parent, { valueEncoding: 'json' });
            }
        }
    }

  async close() {
    if (this.#db.close) {
      await this.#db.close();
    } else if (this.#db.closeSync) {
      this.#db.closeSync();
    } else {
      // In-memory map does not need to be closed
    }
  }
  async ready() {
    return this.#db.open ? this.#db.open() : Promise.resolve();
  }

  async batch(callback) {
    assert(this.#batch === undefined, 'batch already ongoing');

    this.#batch = [];

    let result;
    try {
      result = await callback();
    } catch (e) {
      this.#batch = undefined;
      throw e;
    }

    const ops = this.#batch;

    // Assert: the last __root__ write in a batch must not be NULL_HASH
    // (Trie.from() inside into(Trie) spuriously writes NULL_HASH, but
    // the real root save must overwrite it before the batch commits)
    const rootWrites = ops.filter(o => o.type === 'put' && o.key === '__root__');
    if (rootWrites.length > 0) {
      const lastRootWrite = rootWrites[rootWrites.length - 1];
      assert(
        lastRootWrite.value !== NULL_HASH.toString('hex'),
        `batch would commit __root__ = NULL_HASH (${rootWrites.length} root writes in batch)`
      );
    }

    await this.#db.batch(this.#batch);

    this.#batch = undefined;

    return result;
  }

  async get(key, deserialise) {
    return deserialise(key, await this.#db.get((key ?? NULL_HASH).toString('hex')), this);
  }

  async put(key, value) {
    key = (key ?? NULL_HASH).toString('hex'),
    value = value.serialise();

    if (this.#batch !== undefined) {
      this.#batch.push({ type: 'put', key, value });
    } else {
      await this.#db.put(key, value);
    }
  }

  async del(key) {
    key = (key ?? NULL_HASH).toString('hex');

    if (this.#batch !== undefined) {
      this.#batch.push({ type: 'del', key });
    } else {
      await this.#db.del(key);
    }
  }

  async size() {
    return this.#db.size !== undefined
      ? this.#db.size
      : this.#db.keys().all().then(it => it.length);
  }
}

function inMemoryMap() {
  const db = new Map();

  return {
    get(k) {
      return db.get(k);
    },

    put(k, v) {
      db.set(k, v);
    },

    del(k) {
      db.delete(k);
    },

    batch(ops) {
      ops.forEach(({ type, key, value }) => {
        this[type](key, value);
      });
    },

    get size() {
      return db.size;
    },
  }
}
