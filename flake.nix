{
  description = "proto-domain: domain TypeScript types and codecs from protobuf (protoc-gen-domain)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
  };

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAll = f: nixpkgs.lib.genAttrs systems (system: f (import nixpkgs { inherit system; }));
    in
    {
      devShells = forAll (pkgs: {
        default = pkgs.mkShell {
          # pnpm itself comes from package.json's packageManager through corepack;
          # buf, biome and tsc come from the workspace's devDependencies.
          packages = [
            pkgs.nodejs_24
            pkgs.corepack_24
            pkgs.buf
          ];
        };
      });

      formatter = forAll (pkgs: pkgs.nixfmt);
    };
}
