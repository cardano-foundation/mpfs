{
  description = "MPF Aiken DevShell";
  nixConfig = {
    extra-substituters = ["https://cache.iog.io"];
    extra-trusted-public-keys = ["hydra.iohk.io:f/Ea+s+dFdN+3Y/G+FDgSq+a5NEWhJGzdjvKNGv0/EQ="];
  };
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    cardano-node-runtime = {
      url = "github:IntersectMBO/cardano-node?ref=10.1.4";
    };
    yaci-cli = {
      url =
        "https://github.com/bloxbean/yaci-devkit/releases/download/v0.10.6-beta/yaci-cli-0.10.6-beta-linux-X64.zip";
      flake = false;
    };
    cardano-addresses = {
      url = "github:intersectMBO/cardano-addresses?ref=4.0.0";
    };

  };

  outputs = { self, nixpkgs, flake-utils, cardano-node-runtime, yaci-cli, cardano-addresses }:
    let
      mkOutputs = system:
        let
          pkgs = import nixpkgs { inherit system; };
          node-pkgs = cardano-node-runtime.project.${system}.pkgs;
          cardano-node = node-pkgs.cardano-node;
          cardano-cli = node-pkgs.cardano-cli;
          cardano-submit-api = node-pkgs.cardano-submit-api;
          cardano-address = cardano-addresses.packages.${system}."cardano-addresses:exe:cardano-address";
        in {
          devShells.default = pkgs.mkShell {
            buildInputs = with pkgs; [
              nodejs
              aiken
              cardano-node
              cardano-cli
              cardano-submit-api
              just
              nodePackages.npm
              asciinema
              cardano-address
            ];
            shellHook = ''

              mkdir -p ~/.yaci-cli/cardano-node/bin
              mkdir -p ~/.yaci-cli/bin/config
              chmod -R +w ~/.yaci-cli
              chmod -R +w ./config
              cp -R ${yaci-cli}/config .
              cp -R ${yaci-cli}/yaci-cli ~/.yaci-cli/bin
              export PATH=$PATH:~/.yaci-cli/bin
              cp ${cardano-node}/bin/cardano-node ~/.yaci-cli/cardano-node/bin/cardano-node
              cp ${cardano-cli}/bin/cardano-cli ~/.yaci-cli/cardano-node/bin
              cp ${cardano-submit-api}/bin/cardano-submit-api ~/.yaci-cli/cardano-node/bin
              chmod -R +w ~/.yaci-cli
              chmod -R +w ./config
            '';
          };


        };
    in flake-utils.lib.eachDefaultSystem (mkOutputs);
}
