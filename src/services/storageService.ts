import { MemData, Indexer } from "@0gfoundation/0g-storage-ts-sdk";
import { ethers } from "ethers";

const RPC_URL = "https://evmrpc-testnet.0g.ai";
const INDEXER_RPC = "https://indexer-storage-testnet-turbo.0g.ai";

export async function uploadToZeroG(payload: unknown): Promise<string> {
  const privateKey = process.env.ZG_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("ZG_PRIVATE_KEY is not set in environment");
  }

  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  const memData = new MemData(bytes);

  const [tree, treeErr] = await memData.merkleTree();
  if (treeErr !== null || tree === null) {
    throw new Error(`0G merkle tree error: ${String(treeErr)}`);
  }

  const rootHash = tree.rootHash();
  console.log(`[0G Storage] Root hash: ${rootHash}`);

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const signer = new ethers.Wallet(privateKey, provider) as any;

  const indexer = new Indexer(INDEXER_RPC);
  const [tx, uploadErr] = await indexer.upload(memData, RPC_URL, signer);

  if (uploadErr !== null) {
    throw new Error(`0G upload error: ${String(uploadErr)}`);
  }

  const hash = tx && "rootHash" in tx ? tx.rootHash : rootHash;
  console.log(`[0G Storage] Upload successful — hash: ${hash}`);
  return hash ?? rootHash ?? "";
}

export async function downloadFromZeroG(rootHash: string): Promise<unknown> {
  console.log(`[0G Storage] Downloading hash: ${rootHash}`);

  const indexer = new Indexer(INDEXER_RPC);

  // 0G SDK downloads to a file path — use a temp location
  const { tmpdir } = await import("os");
  const { join } = await import("path");
  const { readFile, unlink } = await import("fs/promises");

  const tempPath = join(tmpdir(), `hackpilot-${Date.now()}.json`);

  const downloadErr = await indexer.download(rootHash, tempPath, false);

  if (downloadErr !== null) {
    throw new Error(`0G download error: ${String(downloadErr)}`);
  }

  // Read and clean up
  const contents = await readFile(tempPath, "utf-8");
  await unlink(tempPath).catch(() => {/* best-effort cleanup */});

  const parsed: unknown = JSON.parse(contents);
  console.log(`[0G Storage] Download successful for hash: ${rootHash}`);
  return parsed;
}