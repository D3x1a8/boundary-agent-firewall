import fs from "node:fs";
import path from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const destination = process.env.BOUNDARY_WALLET_PATH;
if (!destination) throw new Error("Set BOUNDARY_WALLET_PATH to an explicit private destination");
const resolved = path.resolve(destination);
if (fs.existsSync(resolved)) throw new Error(`Refusing to overwrite existing wallet: ${resolved}`);

const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);
fs.mkdirSync(path.dirname(resolved), { recursive: true, mode: 0o700 });
fs.writeFileSync(resolved, `${JSON.stringify({ chain: "base", address: account.address, privateKey, createdAt: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600, flag: "wx" });
fs.chmodSync(resolved, 0o600);
console.log(JSON.stringify({ address: account.address, chain: "Base", file: resolved, funded: false }));
