import assert from 'node:assert';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { inspect } from 'node:util';

import test from 'ava';

import { Store } from '../lib/store.js';
import { Leaf, Branch, Proof, Trie } from '../lib/trie.js';
import * as helpers from '../lib/helpers.js';


const FRUITS_LIST = [
  { key: 'apple[uid: 58]', value: '🍎' },
  { key: 'apricot[uid: 0]', value: '🤷' },
  { key: 'banana[uid: 218]', value: '🍌' },
  { key: 'blueberry[uid: 0]', value: '🫐' },
  { key: 'cherry[uid: 0]', value: '🍒' },
  { key: 'coconut[uid: 0]', value: '🥥' },
  { key: 'cranberry[uid: 0]', value: '🤷' },
  { key: 'fig[uid: 68267]', value: '🤷' },
  { key: 'grapefruit[uid: 0]', value: '🤷' },
  { key: 'grapes[uid: 0]', value: '🍇' },
  { key: 'guava[uid: 344]', value: '🤷' },
  { key: 'kiwi[uid: 0]', value: '🥝' },
  { key: 'kumquat[uid: 0]', value: '🤷' },
  { key: 'lemon[uid: 0]', value: '🍋' },
  { key: 'lime[uid: 0]', value: '🤷' },
  { key: 'mango[uid: 0]', value: '🥭' },
  { key: 'orange[uid: 0]', value: '🍊' },
  { key: 'papaya[uid: 0]', value: '🤷' },
  { key: 'passionfruit[uid: 0]', value: '🤷' },
  { key: 'peach[uid: 0]', value: '🍑' },
  { key: 'pear[uid: 0]', value: '🍐' },
  { key: 'pineapple[uid: 12577]', value: '🍍' },
  { key: 'plum[uid: 15492]', value: '🤷' },
  { key: 'pomegranate[uid: 0]', value: '🤷' },
  { key: 'raspberry[uid: 0]', value: '🤷' },
  { key: 'strawberry[uid: 2532]', value: '🍓' },
  { key: 'tangerine[uid: 11]', value: '🍊' },
  { key: 'tomato[uid: 83468]', value: '🍅' },
  { key: 'watermelon[uid: 0]', value: '🍉' },
  { key: 'yuzu[uid: 0]', value: '🤷' },
];


// -----------------------------------------------------------------------------
// ------------------------------------------------------------------------ Trie
// -----------------------------------------------------------------------------

test('Trie: a new Trie is always empty', t => {
  const trie = new Trie();
  t.true(trie.isEmpty());
});

test('Trie: an empty Trie has no hash', t => {
  const trie = new Trie();
  t.is(trie.hash, null)
});

test('Trie: inspect an empty trie', t => {
  const trie = new Trie();
  t.is(inspect(trie), 'ø');
});

test('Trie: can construct from an empty list', async t => {
  t.deepEqual(await Trie.fromList([]), new Trie());
});


test('Trie: cannot prove anything on an empty trie', async t => {
  const trie = new Trie();
  await t.throwsAsync(
    () => trie.prove("foo"),
    { message(e) { return e.startsWith('cannot walk empty trie') } },
  );
});

test('Trie: can be constructed from a single value', async t => {
  const pairs = [{ key: 'foo', value: 'bar' }]
  const trie = await Trie.fromList(pairs);

  t.true(trie instanceof Leaf);
  t.false(trie.hash == null);
  t.is(trie.prefix.length, 64);
  t.is(trie.key.toString(), pairs[0].key);
  t.is(trie.value.toString(), pairs[0].value);
});

test('Trie: can be constructed from two values', async t => {
  const pairs = [
    { key: 'foo', value: '14' },
    { key: 'bar', value: '42' },
  ];

  const trie = await Trie.fromList(pairs);

  t.is(trie.size, 2);
  t.false(trie.hash == null);
  t.false(trie instanceof Leaf);

  await trie.fetchChildren();

  const foo = await trie.childAt('b');
  t.true(foo instanceof Leaf);
  t.is(foo.prefix.length, 63);
  t.is(foo.key.toString(), pairs[0].key);
  t.is(foo.value.toString(), pairs[0].value);

  const bar = await trie.childAt('8');
  t.true(bar instanceof Leaf);
  t.is(bar.prefix.length, 63);
  t.is(bar.key.toString(), pairs[1].key);
  t.is(bar.value.toString(), pairs[1].value);
});


// -----------------------------------------------------------------------------
// ----------------------------------------------------------------- Trie.insert
// -----------------------------------------------------------------------------

test('Trie.insert: into empty', async t => {
  let trie = new Trie();
  await trie.insert('foo', '14');
  t.true(trie instanceof Leaf);
  t.deepEqual(trie, await Trie.fromList([{ key: 'foo', value: '14' }]));
});

test('Trie.insert: into leaf', async t => {
  const foo = { key: 'foo', value: '14' };
  const bar = { key: 'bar', value: '42' };

  let trie = await Trie.fromList([foo]);
  await trie.insert(bar.key, bar.value);
  t.true(trie instanceof Branch);

  t.deepEqual(trie, await Trie.fromList([foo, bar]));
});

test.skip('Trie.load', async t => {
  const store = new Store(tmpFilename());

  await store.ready();

  await Trie.fromList(FRUITS_LIST, store);

  const trie = await Trie.load(store);

  t.is(inspect(trie), unindent`
    ╔═══════════════════════════════════════════════════════════════════╗
    ║ #4acd78f345a686361df77541b2e0b533f53362e36620a1fdd3a13e0b61a3b078 ║
    ╚═══════════════════════════════════════════════════════════════════╝
     ┌─ 0 #520a7f805c5f
     ├─ 1 #58c5e4a29601
     ├─ 2 #c9431d708d20
     ├─ 3 #070a12b8b349
     ├─ 4 #79519b8cdfbd
     ├─ 5 #08434fd717ae
     ├─ 7 #aeb3a9f2e198
     ├─ 8 #b27d20a5187a
     ├─ a #c2f2115774c1
     ├─ b #da0bdb30bf45
     ├─ c #a22a7b4d767a
     ├─ d #0a747d583e2e
     ├─ e #da1771d107c8
     └─ f #117abf0e19fb
  `);
});

test('Trie.insert: whole trie in any order', async t => {
  await Promise.all([undefined, new Store(tmpFilename())].map(async store => {
    const trie = await shuffle(FRUITS_LIST).reduce(async (trie, fruit, ix) => {
      trie = await trie;
      t.is(trie.size, ix);
      t.true(trie === await trie.insert(fruit.key, fruit.value));
      await t.throwsAsync(() => trie.insert(fruit.key, fruit.value));
      return trie;
    }, new Trie(store));

    t.false(trie.children.some(node => node !== undefined && node instanceof Trie))

    t.is(inspect(trie), unindent`
      ╔═══════════════════════════════════════════════════════════════════╗
      ║ #4acd78f345a686361df77541b2e0b533f53362e36620a1fdd3a13e0b61a3b078 ║
      ╚═══════════════════════════════════════════════════════════════════╝
       ┌─ 0 #520a7f805c5f
       ├─ 1 #58c5e4a29601
       ├─ 2 #c9431d708d20
       ├─ 3 #070a12b8b349
       ├─ 4 #79519b8cdfbd
       ├─ 5 #08434fd717ae
       ├─ 7 #aeb3a9f2e198
       ├─ 8 #b27d20a5187a
       ├─ a #c2f2115774c1
       ├─ b #da0bdb30bf45
       ├─ c #a22a7b4d767a
       ├─ d #0a747d583e2e
       ├─ e #da1771d107c8
       └─ f #117abf0e19fb
    `);

    const sameTrie = await Trie.fromList(FRUITS_LIST);
    t.deepEqual(trie, sameTrie);

    await Promise.all([
      trie.fetchChildren(Number.MAX_SAFE_INTEGER),
      sameTrie.fetchChildren(Number.MAX_SAFE_INTEGER),
    ]);
    t.deepEqual(trie, sameTrie);
    t.is(inspect(trie), unindent`
      ╔═══════════════════════════════════════════════════════════════════╗
      ║ #4acd78f345a686361df77541b2e0b533f53362e36620a1fdd3a13e0b61a3b078 ║
      ╚═══════════════════════════════════════════════════════════════════╝
       ┌─ 0 #520a7f805c5f
       │  ├─ 389fd..[54 digits]..1abc #56408b9882f8 { mango[uid: 0] → 🥭 }
       │  └─ 9d230..[54 digits]..9ecc #9ca49c0d73d5 { lemon[uid: 0] → 🍋 }
       ├─ 16a4 #58c5e4a29601
       │  ├─ 3a30b..[51 digits]..a968 #86410153344f { cherry[uid: 0] → 🍒 }
       │  ├─ 8584c..[51 digits]..d4a5 #cda1c8929d05 { tomato[uid: 83468] → 🍅 }
       │  └─ b7ce0..[51 digits]..f157 #472d5ccbcae8 { plum[uid: 15492] → 🤷 }
       ├─ 245 #c9431d708d20
       │  ├─ 4c787..[52 digits]..c20e #e38b422bd7d9 { pineapple[uid: 12577] → 🍍 }
       │  ├─ a4f81..[52 digits]..90a3 #3e2491668264 { pomegranate[uid: 0] → 🤷 }
       │  └─ e3fc8..[52 digits]..e7c3 #eda213c9a1ca { strawberry[uid: 2532] → 🍓 }
       ├─ 3e #070a12b8b349
       │  ├─ d002d..[53 digits]..f3ac #b40093af0024 { lime[uid: 0] → 🤷 }
       │  └─ e659e..[53 digits]..b3b9 #242b464043b4 { banana[uid: 218] → 🍌 }
       ├─ 4 #79519b8cdfbd
       │  ├─ 07 #fdd60cf1b755
       │  │  ├─ 6d8ab..[52 digits]..73ef #c538c893306a { guava[uid: 344] → 🤷 }
       │  │  └─ c5847..[52 digits]..4a22 #785e20425cf9 { kiwi[uid: 0] → 🥝 }
       │  └─ a522f..[54 digits]..20cd #e0b9d1f525e3 { kumquat[uid: 0] → 🤷 }
       ├─ 5 #08434fd717ae
       │  ├─ cddcd..[54 digits]..aa9e #8a1256a87426 { watermelon[uid: 0] → 🍉 }
       │  └─ e #e26d8409cd76
       │     ├─ 7ccfe..[53 digits]..4440 #c387ec2e54f6 { yuzu[uid: 0] → 🤷 }
       │     └─ d71f9..[53 digits]..26d2 #cfcc9c732f50 { apple[uid: 58] → 🍎 }
       ├─ 78666..[55 digits]..7292 #aeb3a9f2e198 { raspberry[uid: 0] → 🤷 }
       ├─ 8af48..[55 digits]..04a8 #b27d20a5187a { tangerine[uid: 11] → 🍊 }
       ├─ a #c2f2115774c1
       │  ├─ 4b927..[54 digits]..3c69 #a6a35d200876 { peach[uid: 0] → 🍑 }
       │  └─ f12 #8ee8d620e9d6
       │     ├─ a1017..[51 digits]..50e7 #a241f4660aa4 { fig[uid: 68267] → 🤷 }
       │     └─ ec412..[51 digits]..71fe #63c036b16617 { passionfruit[uid: 0] → 🤷 }
       ├─ b #da0bdb30bf45
       │  ├─ 67e71..[54 digits]..c48b #f39b1b5089f8 { grapefruit[uid: 0] → 🤷 }
       │  └─ 88701..[54 digits]..949e #85acec96ac0f { blueberry[uid: 0] → 🫐 }
       ├─ c #a22a7b4d767a
       │  ├─ 5dc3c..[54 digits]..a3f3 #4c51531ac9d9 { cranberry[uid: 0] → 🤷 }
       │  └─ 8cac1..[54 digits]..c3ca #8e27b4cf47de { orange[uid: 0] → 🍊 }
       ├─ d #0a747d583e2e
       │  ├─ b3047..[54 digits]..502a #54d9ea3b162d { coconut[uid: 0] → 🥥 }
       │  └─ f779e..[54 digits]..678a #a82bdd8e07c2 { pear[uid: 0] → 🍐 }
       ├─ e5993..[55 digits]..c9ec #da1771d107c8 { apricot[uid: 0] → 🤷 }
       └─ f #117abf0e19fb
          ├─ 63c88..[54 digits]..21ca #62bda6837164 { papaya[uid: 0] → 🤷 }
          └─ b69c0..[54 digits]..2145 #c8e795f7b215 { grapes[uid: 0] → 🍇 }
    `);

    t.is(await trie.store.size(), 46); // 45 nodes + the root index
  }));
});


test('Trie.insert: already inserted', async t => {
  const trie = await Trie.fromList(FRUITS_LIST);

  await FRUITS_LIST.reduce(async (task, fruit) => {
    await task;
    return t.throwsAsync(
      () => trie.insert(fruit.key, '🤷'),
      { message(e) { return e.startsWith('element already in the trie') } },
      fruit.key,
    );
  }, Promise.resolve());

  const sameTrie = await Trie.fromList(FRUITS_LIST);

  t.deepEqual(await trie.save(), sameTrie);
});

// -----------------------------------------------------------------------------
// -------------------------------------------------------------------- Trie.get
// -----------------------------------------------------------------------------

test('Trie.get: empty trie', async t => {
  const trie = new Trie();
  t.is(await trie.get("foo"), undefined);
});

test('Trie.get: direct leaf', async t => {
  const trie = await Trie.fromList([{ key: 'foo', value: '14' }]);
  t.true(trie instanceof Leaf);

  t.is((await trie.get('foo')).toString(), '14');
  t.is(await trie.get('fo'), undefined);
  t.is(await trie.get('fooo'), undefined);
});

test('Trie.get: fruits', async t => {
  const trie = await Trie.fromList(FRUITS_LIST);

  t.true(Buffer.from('🥝').equals(await trie.get('kiwi[uid: 0]')));
  t.true(Buffer.from('🍌').equals(await trie.get('banana[uid: 218]')));
  t.is(await trie.get('banana[uid: 219]'), undefined);
});

// -----------------------------------------------------------------------------
// ----------------------------------------------------------------- Trie.delete
// -----------------------------------------------------------------------------

test('Trie.delete: from Leaf', async t => {
  const trie = await Trie.fromList([{ key: 'foo', value: '14' }]);
  t.true(trie instanceof Leaf);

  await trie.delete('foo');

  t.true(trie.isEmpty());
  t.true(trie instanceof Trie);
});


test('Trie.delete: from Branch with 2 neighbors', async t => {
  const trie = await Trie.fromList([
    { key: 'foo', value: '14' },
    { key: 'bar', value: '42' },
  ]);
  t.true(trie instanceof Branch);

  await trie.delete('foo');

  t.true(trie instanceof Leaf);
  t.is(trie.size, 1);
  t.is(await trie.store.size(), 2);
});

test('Trie.delete: from Branch with 2+ neighbors', async t => {
  const trie = await Trie.fromList([
    { key: 'foo', value: '14' },
    { key: 'bar', value: '42' },
    { key: 'baz', value: '27' },
  ]);
  t.true(trie instanceof Branch);

  await trie.delete('foo');

  t.true(trie instanceof Branch);
  t.is(trie.size, 2);
  t.is(await trie.store.size(), 4);
});

test('Trie.delete+insert round-trip: single key update restores root', async t => {
  await Promise.all([undefined, new Store(tmpFilename())].map(async store => {
    const trie = await Trie.fromList(FRUITS_LIST, store);
    const originalHash = trie.hash.toString('hex');
    const originalSize = trie.size;

    const change = { type: 'update', key: 'apple[uid: 58]', oldValue: '🍎', newValue: '🍏' };

    await updateTrie(trie, change);
    await updateTrie(trie, invertUnslottedChange(change));

    t.is(trie.size, originalSize, `size should be restored (store=${!!store})`);
    t.is(
      trie.hash.toString('hex'),
      originalHash,
      `root hash should be restored after update round-trip (store=${!!store})`
    );
  }));
});

test('Trie.delete+insert round-trip: multiple keys', async t => {
  await Promise.all([undefined, new Store(tmpFilename())].map(async store => {
    const trie = await Trie.fromList(FRUITS_LIST, store);
    const originalHash = trie.hash.toString('hex');

    const changes = [
      { type: 'update', key: 'apple[uid: 58]', oldValue: '🍎', newValue: 'new_apple' },
      { type: 'update', key: 'banana[uid: 218]', oldValue: '🍌', newValue: 'new_banana' },
      { type: 'update', key: 'cherry[uid: 0]', oldValue: '🍒', newValue: 'new_cherry' },
    ];

    for (const change of changes) {
      await updateTrie(trie, change);
    }

    for (const change of [...changes].reverse()) {
      await updateTrie(trie, invertUnslottedChange(change));
    }

    t.is(
      trie.hash.toString('hex'),
      originalHash,
      `root hash should be restored after multiple update round-trips (store=${!!store})`
    );
  }));
});

test('Trie.delete+insert round-trip: single insert then rollback', async t => {
  await Promise.all([undefined, new Store(tmpFilename())].map(async store => {
    const trie = await Trie.fromList(FRUITS_LIST, store);
    const originalHash = trie.hash.toString('hex');

    const change = { type: 'insert', key: 'dragonfruit[uid: 99]', newValue: '🐉' };

    await updateTrie(trie, change);
    t.is(trie.size, FRUITS_LIST.length + 1);

    await updateTrie(trie, invertUnslottedChange(change));

    t.is(trie.size, FRUITS_LIST.length);
    t.is(
      trie.hash.toString('hex'),
      originalHash,
      `root hash should be restored after insert round-trip (store=${!!store})`
    );
  }));
});

test('Trie.delete+insert round-trip: single delete then rollback', async t => {
  await Promise.all([undefined, new Store(tmpFilename())].map(async store => {
    const trie = await Trie.fromList(FRUITS_LIST, store);
    const originalHash = trie.hash.toString('hex');

    const change = { type: 'delete', key: 'apple[uid: 58]', oldValue: '🍎' };

    await updateTrie(trie, change);
    t.is(trie.size, FRUITS_LIST.length - 1);

    await updateTrie(trie, invertUnslottedChange(change));

    t.is(trie.size, FRUITS_LIST.length);
    t.is(
      trie.hash.toString('hex'),
      originalHash,
      `root hash should be restored after delete round-trip (store=${!!store})`
    );
  }));
});

// These tests use updateTrie + invertUnslottedChange to mirror the exact
// production code path from change.ts and safeTrie.ts rollback.

test('Trie.updateTrie round-trip: update change type', async t => {
  await Promise.all([undefined, new Store(tmpFilename())].map(async store => {
    const trie = await Trie.fromList(FRUITS_LIST, store);
    const originalHash = trie.hash.toString('hex');

    const change = { type: 'update', key: 'apple[uid: 58]', oldValue: '🍎', newValue: '🍏' };

    await updateTrie(trie, change);
    await updateTrie(trie, invertUnslottedChange(change));

    t.is(
      trie.hash.toString('hex'),
      originalHash,
      `update round-trip should restore root (store=${!!store})`
    );
  }));
});

test('Trie.updateTrie round-trip: insert change type', async t => {
  await Promise.all([undefined, new Store(tmpFilename())].map(async store => {
    const trie = await Trie.fromList(FRUITS_LIST, store);
    const originalHash = trie.hash.toString('hex');

    const change = { type: 'insert', key: 'dragonfruit[uid: 99]', newValue: '🐉' };

    await updateTrie(trie, change);
    await updateTrie(trie, invertUnslottedChange(change));

    t.is(
      trie.hash.toString('hex'),
      originalHash,
      `insert round-trip should restore root (store=${!!store})`
    );
  }));
});

test('Trie.updateTrie round-trip: delete change type', async t => {
  await Promise.all([undefined, new Store(tmpFilename())].map(async store => {
    const trie = await Trie.fromList(FRUITS_LIST, store);
    const originalHash = trie.hash.toString('hex');

    const change = { type: 'delete', key: 'apple[uid: 58]', oldValue: '🍎' };

    await updateTrie(trie, change);
    await updateTrie(trie, invertUnslottedChange(change));

    t.is(
      trie.hash.toString('hex'),
      originalHash,
      `delete round-trip should restore root (store=${!!store})`
    );
  }));
});

test('Trie.updateTrie round-trip: multiple update changes in sequence', async t => {
  await Promise.all([undefined, new Store(tmpFilename())].map(async store => {
    const trie = await Trie.fromList(FRUITS_LIST, store);
    const originalHash = trie.hash.toString('hex');

    const changes = [
      { type: 'update', key: 'apple[uid: 58]', oldValue: '🍎', newValue: 'new_apple' },
      { type: 'update', key: 'banana[uid: 218]', oldValue: '🍌', newValue: 'new_banana' },
      { type: 'update', key: 'cherry[uid: 0]', oldValue: '🍒', newValue: 'new_cherry' },
    ];

    for (const change of changes) {
      await updateTrie(trie, change);
    }

    for (const change of [...changes].reverse()) {
      await updateTrie(trie, invertUnslottedChange(change));
    }

    t.is(
      trie.hash.toString('hex'),
      originalHash,
      `multiple update round-trips should restore root (store=${!!store})`
    );
  }));
});

test('Trie.updateTrie round-trip: loaded from store (lazy children)', async t => {
  const store = new Store(tmpFilename());
  await store.ready();

  const original = await Trie.fromList(FRUITS_LIST, store);
  const originalHash = original.hash.toString('hex');

  // Load from store — children are lazy stubs { hash: Buffer }, not Trie instances
  const trie = await Trie.load(store);
  t.is(trie.hash.toString('hex'), originalHash, 'loaded hash matches');

  const change = { type: 'update', key: 'apple[uid: 58]', oldValue: '🍎', newValue: '🍏' };

  await updateTrie(trie, change);
  await updateTrie(trie, invertUnslottedChange(change));

  t.is(
    trie.hash.toString('hex'),
    originalHash,
    'loaded trie: root should be restored after update round-trip'
  );
});

test('Trie.updateTrie round-trip: loaded from store, multiple updates', async t => {
  const store = new Store(tmpFilename());
  await store.ready();

  const original = await Trie.fromList(FRUITS_LIST, store);
  const originalHash = original.hash.toString('hex');

  const trie = await Trie.load(store);

  const changes = [
    { type: 'update', key: 'apple[uid: 58]', oldValue: '🍎', newValue: 'new_apple' },
    { type: 'update', key: 'banana[uid: 218]', oldValue: '🍌', newValue: 'new_banana' },
    { type: 'update', key: 'cherry[uid: 0]', oldValue: '🍒', newValue: 'new_cherry' },
  ];

  for (const change of changes) {
    await updateTrie(trie, change);
  }

  for (const change of [...changes].reverse()) {
    await updateTrie(trie, invertUnslottedChange(change));
  }

  t.is(
    trie.hash.toString('hex'),
    originalHash,
    'loaded trie: root should be restored after multiple update round-trips'
  );
});

test('Trie.updateTrie round-trip: large trie (500+ entries)', async t => {
  const largeList = [];
  for (let i = 0; i < 600; i++) {
    largeList.push({
      key: `credential_${randomBytes(20).toString('hex')}[slot:${i}]`,
      value: randomBytes(32).toString('hex'),
    });
  }

  const store = new Store(tmpFilename());
  await store.ready();

  let trie = new Trie(store);
  for (const { key, value } of largeList) {
    await trie.insert(key, value);
  }
  const originalHash = trie.hash.toString('hex');

  const targets = [largeList[0], largeList[100], largeList[299], largeList[500]];

  for (const { key, value } of targets) {
    const change = { type: 'update', key, oldValue: value, newValue: 'updated_' + value.slice(8) };

    await updateTrie(trie, change);
    await updateTrie(trie, invertUnslottedChange(change));

    t.is(
      trie.hash.toString('hex'),
      originalHash,
      `large trie: root should be restored after updating key ${key.slice(0, 30)}...`
    );
  }
});

test('Trie.updateTrie round-trip: large trie, batch of updates then batch rollback', async t => {
  const largeList = [];
  for (let i = 0; i < 600; i++) {
    largeList.push({
      key: `credential_${randomBytes(20).toString('hex')}[slot:${i}]`,
      value: randomBytes(32).toString('hex'),
    });
  }

  const store = new Store(tmpFilename());
  await store.ready();

  let trie = new Trie(store);
  for (const { key, value } of largeList) {
    await trie.insert(key, value);
  }
  const originalHash = trie.hash.toString('hex');

  const changes = [
    { type: 'update', key: largeList[50].key, oldValue: largeList[50].value, newValue: 'updated_50' },
    { type: 'update', key: largeList[200].key, oldValue: largeList[200].value, newValue: 'updated_200' },
    { type: 'update', key: largeList[400].key, oldValue: largeList[400].value, newValue: 'updated_400' },
  ];

  // Forward: apply all updates (like temporaryUpdate does)
  for (const change of changes) {
    await updateTrie(trie, change);
  }

  // Rollback in reverse order (like safeTrie.rollback does)
  for (const change of [...changes].reverse()) {
    await updateTrie(trie, invertUnslottedChange(change));
  }

  t.is(
    trie.hash.toString('hex'),
    originalHash,
    'large trie: root should be restored after batch of updates + rollback'
  );
});

test('Trie.updateTrie round-trip: large trie loaded from store', async t => {
  const largeList = [];
  for (let i = 0; i < 600; i++) {
    largeList.push({
      key: `credential_${randomBytes(20).toString('hex')}[slot:${i}]`,
      value: randomBytes(32).toString('hex'),
    });
  }

  const store = new Store(tmpFilename());
  await store.ready();

  let builder = new Trie(store);
  for (const { key, value } of largeList) {
    await builder.insert(key, value);
  }
  const originalHash = builder.hash.toString('hex');

  // Load from store (lazy children) — exactly like production
  const trie = await Trie.load(store);
  t.is(trie.hash.toString('hex'), originalHash, 'loaded hash matches');

  const change = {
    type: 'update',
    key: largeList[300].key,
    oldValue: largeList[300].value,
    newValue: 'UPDATED_VALUE',
  };

  await updateTrie(trie, change);
  await updateTrie(trie, invertUnslottedChange(change));

  t.is(
    trie.hash.toString('hex'),
    originalHash,
    'large loaded trie: root should be restored after update round-trip'
  );
});

test.skip('Trie.delete: whole trie in any order', async t => {
  const initial_size = FRUITS_LIST.length;

  await Promise.all([undefined, new Store(tmpFilename())].map(async store => {
    const trie = await shuffle(FRUITS_LIST).reduce(async (trie, fruit, ix) => {
      trie = await trie;
      t.is(trie.size, initial_size - ix);
      t.true(trie === await trie.delete(fruit.key));
      await t.throwsAsync(() => trie.prove(fruit.key));
      await t.throwsAsync(() => trie.delete(fruit.key));
      return trie;
    }, Trie.fromList(FRUITS_LIST, store));

    t.true(trie.isEmpty())
    t.is(trie.size, 0);

    t.false(trie instanceof Leaf);
    t.false(trie instanceof Branch);

    const root = await trie.store.get('__root__', (_, x) => Buffer.from(x, 'hex'));

    t.true(root.equals(helpers.NULL_HASH));
    t.is(trie.hash, null);
    t.is(await trie.store.size(), 1);
  }));
});

// -----------------------------------------------------------------------------
// ------------------------------------------------------------------ Trie.prove
// -----------------------------------------------------------------------------

test('Trie: can create proof for leaf-trie for existing element', async t => {
  const trie = await Trie.fromList([{ key: 'foo', value: '14' }]);
  const proof = await trie.prove('foo');
  t.is(
    proof.verify().toString('hex'),
    trie.hash.toString('hex'),
  );
});

test('Trie: cannot create proof for leaf-trie for non-existing elements', async t => {
  const trie = await Trie.fromList([{ key: 'foo', value: '14' }]);
  await t.throwsAsync(() => trie.prove('bar'), {
    message(e) { return e.includes('not in trie') },
  });
});

test('Trie: can create proof for simple tries', async t => {
  const pairs = [
    { key: 'foo', value: '14' },
    { key: 'bar', value: '42' },
  ];

  const trie = await Trie.fromList(pairs);
  t.is(trie.size, 2);
  await trie.fetchChildren(1);
  t.is(inspect(trie), unindent`
    ╔═══════════════════════════════════════════════════════════════════╗
    ║ #69509862d51b65b26be6e56d3286d2ff00a0e8091d004721f4d2ce6918325c18 ║
    ╚═══════════════════════════════════════════════════════════════════╝
     ┌─ 84418..[55 digits]..e71d #b310552e86bf { bar → 42 }
     └─ b8fe9..[55 digits]..49fd #95bb7f919c90 { foo → 14 }
  `);

  const proofs = {
    foo: await trie.prove('foo'),
    bar: await trie.prove('bar'),
  };

  t.true(proofs.foo.verify().equals(trie.hash));
  t.true(proofs.bar.verify().equals(trie.hash));

  await t.throwsAsync(() => trie.prove('fo'));
  await t.throwsAsync(() => trie.prove('ba'));
  await t.throwsAsync(() => trie.prove('foobar'));
});

test('Trie: checking for membership & insertion on complex trie', async t => {
  const trie = await Trie.fromList(FRUITS_LIST);

  t.is(trie.size, 30);

  FRUITS_LIST.forEach(async fruit => {
    const proof = await trie.prove(fruit.key);

    // Prove membership
    t.true(proof.verify(true).equals(trie.hash), fruit.key);

    const trieWithout = await Trie.fromList(FRUITS_LIST.filter(x => x.key !== fruit.key));

    // Prove insertion
    t.true(proof.verify(false).equals(trieWithout.hash), fruit.key);

    // For (re-)generating Aiken code for proofs.

    // const fruitName = fruit.key.split("[")[0];
    // console.log(`// ---------- ${fruitName}\n`);
    // console.log(`const ${fruitName} = "${fruit.key}"`);
    // console.log(`fn proof_${fruitName}() {\n${proof.toAiken()}\n}\n`);
    // console.log(`fn without_${fruitName}() {\n  mpf.from_root(#"${trieWithout.hash.toString('hex')}")\n}\n\n`);
  });
});

// -----------------------------------------------------------------------------
// ---------------------------------------------------------------- Proof.toJSON
// -----------------------------------------------------------------------------

test('Proof.toJSON (mango)', async t => {
  const trie = await Trie.fromList(FRUITS_LIST);
  const proof = await trie.prove('mango[uid: 0]');
  t.deepEqual(proof.toJSON(), [
    {
      neighbors: 'c7bfa4472f3a98ebe0421e8f3f03adf0f7c4340dec65b4b92b1c9f0bed209eb45fdf82687b1ab133324cebaf46d99d49f92720c5ded08d5b02f57530f2cc5a5f1508f13471a031a21277db8817615e62a50a7427d5f8be572746aa5f0d49841758c5e4a29601399a5bd916e5f3b34c38e13253f4de2a3477114f1b2b8f9f2f4d',
      skip: 0,
      type: 'branch',
    },
    {
      neighbor: {
        key: '09d23032e6edc0522c00bc9b74edd3af226d1204a079640a367da94c84b69ecc',
        value: 'c29c35ad67a5a55558084e634ab0d98f7dd1f60070b9ce2a53f9f305fd9d9795',
      },
      skip: 0,
      type: 'leaf',
    },
  ]);
});

test('Proof.toJSON (kumquat)', async t => {
  const trie = await Trie.fromList(FRUITS_LIST);
  const proof = await trie.prove('kumquat[uid: 0]');
  t.deepEqual(proof.toJSON(), [
    {
      neighbors: 'c7bfa4472f3a98ebe0421e8f3f03adf0f7c4340dec65b4b92b1c9f0bed209eb47238ba5d16031b6bace4aee22156f5028b0ca56dc24f7247d6435292e82c039c3490a825d2e8deddf8679ce2f95f7e3a59d9c3e1af4a49b410266d21c9344d6d08434fd717aea47d156185d589f44a59fc2e0158eab7ff035083a2a66cd3e15b',
      skip: 0,
      type: 'branch',
    },
    {
      neighbor: {
        nibble: 0,
        prefix: '07',
        root: 'a1ffbc0e72342b41129e2d01d289809079b002e54b123860077d2d66added281',
      },
      skip: 0,
      type: 'fork',
    },
  ]);
});

// -----------------------------------------------------------------------------
// ---------------------------------------------------------------- Proof.toCBOR
// -----------------------------------------------------------------------------

test('Proof.toCBOR (mango)', async t => {
  const trie = await Trie.fromList(FRUITS_LIST);
  const proof = await trie.prove('mango[uid: 0]');
  t.true(proof.toCBOR().equals(Buffer.from('9fd8799f005f5840c7bfa4472f3a98ebe0421e8f3f03adf0f7c4340dec65b4b92b1c9f0bed209eb45fdf82687b1ab133324cebaf46d99d49f92720c5ded08d5b02f57530f2cc5a5f58401508f13471a031a21277db8817615e62a50a7427d5f8be572746aa5f0d49841758c5e4a29601399a5bd916e5f3b34c38e13253f4de2a3477114f1b2b8f9f2f4dffffd87b9f00582009d23032e6edc0522c00bc9b74edd3af226d1204a079640a367da94c84b69ecc5820c29c35ad67a5a55558084e634ab0d98f7dd1f60070b9ce2a53f9f305fd9d9795ffff', 'hex')));
});

test('Proof.toCBOR (kumquat)', async t => {
  const trie = await Trie.fromList(FRUITS_LIST);
  const proof = await trie.prove('kumquat[uid: 0]');
  t.true(proof.toCBOR().equals(Buffer.from('9fd8799f005f5840c7bfa4472f3a98ebe0421e8f3f03adf0f7c4340dec65b4b92b1c9f0bed209eb47238ba5d16031b6bace4aee22156f5028b0ca56dc24f7247d6435292e82c039c58403490a825d2e8deddf8679ce2f95f7e3a59d9c3e1af4a49b410266d21c9344d6d08434fd717aea47d156185d589f44a59fc2e0158eab7ff035083a2a66cd3e15bffffd87a9f00d8799f0041075820a1ffbc0e72342b41129e2d01d289809079b002e54b123860077d2d66added281ffffff', 'hex')));
});

// -----------------------------------------------------------------------------
// --------------------------------------------------------------- Proof.toAiken
// -----------------------------------------------------------------------------

test('Proof.toAiken (mango)', async t => {
  const trie = await Trie.fromList(FRUITS_LIST);
  const proof = await trie.prove('mango[uid: 0]');
  t.is(proof.toAiken(), unindent`
    [
      Branch { skip: 0, neighbors: #"c7bfa4472f3a98ebe0421e8f3f03adf0f7c4340dec65b4b92b1c9f0bed209eb45fdf82687b1ab133324cebaf46d99d49f92720c5ded08d5b02f57530f2cc5a5f1508f13471a031a21277db8817615e62a50a7427d5f8be572746aa5f0d49841758c5e4a29601399a5bd916e5f3b34c38e13253f4de2a3477114f1b2b8f9f2f4d" },
      Leaf { skip: 0, key: #"09d23032e6edc0522c00bc9b74edd3af226d1204a079640a367da94c84b69ecc", value: #"c29c35ad67a5a55558084e634ab0d98f7dd1f60070b9ce2a53f9f305fd9d9795" },
    ]
  `);
});

test('Proof.toAiken (kumquat)', async t => {
  const trie = await Trie.fromList(FRUITS_LIST);
  const proof = await trie.prove('kumquat[uid: 0]');
  t.is(proof.toAiken(), unindent`
    [
      Branch { skip: 0, neighbors: #"c7bfa4472f3a98ebe0421e8f3f03adf0f7c4340dec65b4b92b1c9f0bed209eb47238ba5d16031b6bace4aee22156f5028b0ca56dc24f7247d6435292e82c039c3490a825d2e8deddf8679ce2f95f7e3a59d9c3e1af4a49b410266d21c9344d6d08434fd717aea47d156185d589f44a59fc2e0158eab7ff035083a2a66cd3e15b" },
      Fork { skip: 0, neighbor: Neighbor { nibble: 0, prefix: #"07", root: #"a1ffbc0e72342b41129e2d01d289809079b002e54b123860077d2d66added281" } },
    ]
  `);
});

// -----------------------------------------------------------------------------
// ---------------------------------------------------------------- Test Helpers
// -----------------------------------------------------------------------------

// Mirrors updateTrie from ../../trie/change.ts exactly
async function updateTrie(trie, change) {
  let proof;
  switch (change.type) {
    case 'insert': {
      await trie.insert(change.key, change.newValue);
      proof = await trie.prove(change.key);
      break;
    }
    case 'delete': {
      proof = await trie.prove(change.key);
      await trie.delete(change.key);
      break;
    }
    case 'update': {
      proof = await trie.prove(change.key);
      await trie.delete(change.key);
      await trie.insert(change.key, change.newValue);
      break;
    }
  }

  // Assert: after each updateTrie, the store's __root__ must match trie.hash
  const storedRoot = await trie.store.get(
    '__root__',
    (_, str) => Buffer.from(str, 'hex'),
  );
  const expectedRoot = trie.hash ?? helpers.NULL_HASH;
  assert(
    storedRoot.equals(expectedRoot),
    `store __root__ (${storedRoot.toString('hex').slice(0, 16)}) != trie.hash (${expectedRoot.toString('hex').slice(0, 16)}) after ${change.type}`
  );

  return proof;
}

// Mirrors invertUnslottedChange from ../../trie/change.ts exactly
function invertUnslottedChange(change) {
  switch (change.type) {
    case 'insert':
      return { type: 'delete', key: change.key, oldValue: change.newValue };
    case 'delete':
      return { type: 'insert', key: change.key, newValue: change.oldValue };
    case 'update':
      return { type: 'update', key: change.key, oldValue: change.newValue, newValue: change.oldValue };
  }
}

function unindent(str) {
  const lines = str[0].split('\n').filter(n => n.length > 0);
  const n = (lines[0] || '').length - (lines[0] || '').trimStart().length;
  return lines.map(s => s.slice(n)).join('\n').trimEnd();
}

function shuffle(xs) {
  return xs
    .map(origin => ({ origin, score: Math.random() }))
    .sort((a, b) => a.score - b.score)
    .map(({ origin }) => origin);
}

function tmpFilename() {
  return path.join(os.tmpdir(), `merkle-patricia-forest-db_${randomBytes(8).toString('hex')}`);
}
