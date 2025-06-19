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
    cp on_chain/plutus.json off_chain/src/plutus.json
    cd off_chain
    npm install

wait_for_service service_name port:
    #!/usr/bin/env bash
    until curl -s "http://localhost:{{port}}" > /dev/null; do
        echo "Waiting for {{service_name}} to be up on port {{port}}..."
        sleep 1
    done

run-docker-E2E-tests:
    #!/usr/bin/env bash
    set -euo pipefail
    just build-on-chain
    just build-off-chain
    cd off_chain
    export CHARLIE_PORT=$(shuf -i 1024-65535 -n 1)
    export BOB_PORT=$(shuf -i 1024-65535 -n 1)
    export ALICE_PORT=$(shuf -i 1024-65535 -n 1)
    name=$(head /dev/urandom | tr -dc a-z0-9 | head -c 8)
    docker compose -f docker/docker-compose.yaml -p "$name" up  -d
    down="docker compose -f docker/docker-compose.yaml -p $name down --volumes"
    trap '$down' EXIT

    just wait_for_service "charlie" "$CHARLIE_PORT"
    just wait_for_service "bob" "$BOB_PORT"
    just wait_for_service "alice" "$ALICE_PORT"
    echo "All services are up and running."

    npx vitest run -t "E2E Signing Tests"



# shellcheck disable=SC2035
run-tests pat:
    #!/usr/bin/env bash
    just wait_for_service "yaci-store" 8080
    just wait_for_service "yaci-admin" 10000
    just wait_for_service "ogmios" 1337
    export YACI_STORE_PORT=8080
    export YACI_ADMIN_PORT=10000
    export OGMIOS_PORT=1337
    cd off_chain
    npx ava --verbose "{{pat}}"
    npx vitest run  -t "{{pat}}"

test-all:
    #!/usr/bin/env bash
    set -euo pipefail
    just wait_for_service "yaci-store" 8080
    just wait_for_service "yaci-admin" 10000
    just wait_for_service "ogmios" 1337
    export YACI_STORE_PORT=8080
    export YACI_ADMIN_PORT=10000
    export OGMIOS_PORT=1337
    cd off_chain
    npx ava
    npx vitest --bail 1 run

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
