# shellcheck shell=bash
# shellcheck disable=SC2164
# https://www.shellcheck.net/wiki/SC2121
# shellcheck disable=SC2155
# https://www.shellcheck.net/wiki/SC2155

build-on-chain:
    #!/usr/bin/env bash
    cd on_chain
    aiken build

check-on-chain:
    #!/usr/bin/env bash
    cd on_chain
    aiken check

build-off-chain:
    #!/usr/bin/env bash
    cp on_chain/plutus.json off_chain/plutus.json
    cd off_chain
    npm install

run-docker-E2E-tests:
    #!/usr/bin/env bash
    just build-on-chain
    just build-off-chain
    cd off_chain
    export YACI_STORE_PORT=$(shuf -i 1024-65535 -n 1)
    export YACI_ADMIN_PORT=$(shuf -i 1024-65535 -n 1)
    export OGMIOS_PORT=$(shuf -i 1024-65535 -n 1)
    export CHARLIE_PORT=$(shuf -i 1024-65535 -n 1)
    export BOB_PORT=$(shuf -i 1024-65535 -n 1)
    export ALICE_PORT=$(shuf -i 1024-65535 -n 1)

    name=$(head /dev/urandom | tr -dc a-z0-9 | head -c 8)
    docker compose -f docker/docker-compose.yaml -p "$name" up  -d
    down="docker compose -f docker/docker-compose.yaml -p $name down --volumes"
    trap '$down' EXIT
    for port in "$CHARLIE_PORT" "$ALICE_PORT" "$BOB_PORT"; do
        until curl -s "http://localhost:$port/tokens" > /dev/null; do
            echo "Waiting for server on port $port to start..."
            sleep 1
        done
    done

    sleep 10 # wait for yaci
    rm -rf tmp
    npx tsx service/test/E2E.ts

run-bare-E2E-tests:
    #!/usr/bin/env bash
    just build-on-chain
    just build-off-chain
    cd off_chain
    export YACI_STORE_PORT=8080
    export YACI_ADMIN_PORT=10000
    export OGMIOS_PORT=1337
    rm -rf tmp
    npx tsx service/test/E2E.ts

inspect-tx tx_dir:
    #!/usr/bin/env bash
    tx_hex=$(jq -r '."tx-hex"' "{{tx_dir}}/log.json")
    jq --arg cbor "$tx_hex" '.cborHex = $cbor' transaction.template.json > "{{tx_dir}}/tx-encoded.json"
    cardano-cli debug transaction view --tx-file "{{tx_dir}}/tx-encoded.json" | jq > "{{tx_dir}}/tx.json"

run-server-generate:
    #!/usr/bin/env bash
    cd off_chain
    rm -rf tmp
    npx tsx service/main.ts --port 3000 --seed mnemonics.txt --generate \
        --provider yaci --yaci-store-host http://localhost:8080 \
        --yaci-admin-host http://localhost:10000

run-server:
    #!/usr/bin/env bash
    cd off_chain
    rm -rf tmp
    npx tsx service/main.ts --port 3000 --seed mnemonics.txt \
        --provider yaci --yaci-store-host http://localhost:8080 \
        --yaci-admin-host http://localhost:10000

docker-down:
    #!/usr/bin/env bash
    cd off_chain
    docker compose -f docker/docker-compose.yaml down --volumes

run-yaci:
    yaci-cli up --enable-yaci-store

format:
    #!/usr/bin/env bash
    cd off_chain
    npx prettier --write "**/*.ts"
    if ! git diff --quiet; then
        echo "Formatting changed files. Please commit the changes." >&2
        exit 1
    fi