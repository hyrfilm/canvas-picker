{
  description = "canvas-picker shell";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    what = {
      url = "github:hyrfilm/what";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { nixpkgs, what, ... }:
    let
      # Current nixpkgs has dropped support for Intel macOS.
      systems = [ "aarch64-darwin" "aarch64-linux" "x86_64-linux" ];
    in {
      devShells = nixpkgs.lib.genAttrs systems (system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          projectWhat = pkgs.writeShellScriptBin "what" ''
            # A quoted sentence arrives as one argument; separate words remain a search.
            if [ "$#" -eq 1 ] && [[ "$1" == *[[:space:]]* ]]; then
              # Scope the save so other files in docs do not trigger a file chooser.
              exec ${what.packages.${system}.default}/bin/what -f "''${WHAT_FILE:-what.txt}" add "$1"
            fi
            exec ${what.packages.${system}.default}/bin/what "$@"
          '';
        in {
          default = pkgs.mkShellNoCC {
            packages = [
              pkgs.nodejs_latest
              pkgs.git
              pkgs.graphviz
              projectWhat
            ];

            shellHook = ''
              # Resolve the live checkout, including worktrees and entry from subdirectories.
              canvas_root="$(git rev-parse --show-toplevel)"
              # Both TypeScript versions provide tsc; the shell uses the native compiler.
              export PATH="$canvas_root/node_modules/@typescript/native/bin:$wednesday_root/node_modules/.bin:$PATH"
              unset canvas_root
            '';
          };
        });
    };
}
