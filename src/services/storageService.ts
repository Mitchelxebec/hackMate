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
  // Cast to any — SDK expects ethers v5 Signer types, we're on ethers v6
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const signer = new ethers.Wallet(privateKey, provider) as any;

  const indexer = new Indexer(INDEXER_RPC);
  const [tx, uploadErr] = await indexer.upload(memData, RPC_URL, signer);

  if (uploadErr !== null) {
    throw new Error(`0G upload error: ${String(uploadErr)}`);
  }

  // tx can be single file {rootHash, txHash} or fragmented {rootHashes[], txHashes[]}
  const hash = tx && "rootHash" in tx ? tx.rootHash : rootHash;
  console.log(`[0G Storage] Upload successful — hash: ${hash}`);
  return hash ?? rootHash ?? "";
}