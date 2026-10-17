# I1 scaffold toolchain review

Reviewed **2026-10-17** for issue #3. Version pins are deliberate; package installation/build success is not exchange/account compatibility evidence.

| Item                | Pin              | Review                                                                                                                                                      |
| ------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js             | 24.22.0          | Active LTS line on the review date; official release and release schedule checked. Installed globally Node 22.18.0 was not used to validate this workspace. |
| pnpm                | 10.5.2           | Existing supported package manager, pinned exactly. This is not a claim that it is the latest pnpm release. Isolated linker and no automatic peer installs. |
| TypeScript          | 6.0.2            | Matches the reviewed SDK compiler generation and typescript-eslint's supported range (`<6.1.0`). Do not silently upgrade to TypeScript 7.                   |
| typescript-eslint   | 8.71.2           | Registry peer metadata supports ESLint 10 and TypeScript 6.0.                                                                                               |
| ESLint / @eslint/js | 10.13.0 / 10.0.1 | Exact registry versions with flat config.                                                                                                                   |
| @types/node         | 24.10.1          | Node 24 type generation, not the Node 26 default.                                                                                                           |
| React / ReactDOM    | 19.3.1           | Exact paired registry releases.                                                                                                                             |
| Vite                | 8.3.4            | Registry runtime requirement accepts Node 24.                                                                                                               |
| Prettier            | 3.9.10           | Exact formatting tool version.                                                                                                                              |
| @polymarket/client  | 0.13.0           | Official Polymarket/ts-sdk package; registry repository and Node `>=24` engine match upstream package metadata.                                             |

## SDK review and remaining proof

Issue #4 adds exact dev-only `selfsigned` **5.5.0** for local certificate generation and deterministic TLS fixtures. Its asynchronous API is used with explicit RSA/SHA256 and IP SAN settings. It does not run inside the browser or create exchange keys. The lockfile records its dependency closure; installation still requires no lifecycle scripts. See the [upstream API documentation](https://github.com/jfromaniello/selfsigned).

The official SDK package changelog for 0.13.0 was reviewed. It includes changes to indexed approval reads and stream metadata, as well as experimental trading surfaces outside this app's scope. The adapter package pins the dependency but exports only an unconfigured read-only descriptor. No SDK object/type enters domain or browser code, and no client, wallet or key is instantiated.

Issue #16 must prove supported private reads using actual supplied L2 credentials without a private order signer. That remains **not run**. There are no official GitHub Releases on the repository release page at review time; the package changelog and published package metadata are the review sources.

## Sources

- [Official Node release](https://nodejs.org/en/blog/release/v24.22.0)
- [Node release schedule](https://nodejs.org/en/about/previous-releases)
- [Node release checksums](https://nodejs.org/dist/v24.22.0/SHASUMS256.txt)
- [Official SDK package metadata](https://github.com/Polymarket/ts-sdk/blob/main/packages/client/package.json)
- [SDK changelog](https://github.com/Polymarket/ts-sdk/blob/main/packages/client/CHANGELOG.md)
- [SDK release page](https://github.com/Polymarket/ts-sdk/releases)
- [pnpm manifest/runtime configuration](https://pnpm.io/package_json)

The local Windows x64 Node archive was verified against the official checksum before use:
`f9683a19877e12a9b167305c8db71040d812876359de21f0d2e97c3f321f80c3`.
