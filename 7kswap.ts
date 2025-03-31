import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { getQuote, buildTx, getSuiClient } from "@7kprotocol/sdk-ts";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import dotenv from 'dotenv';

dotenv.config();

const WALLET_ADDRESSES = process.env.WALLET_ADDRESSES?.split(',') || [];
const SEED_PHRASES = process.env.SEED_PHRASES?.split(',') || [];

const SUI_CONTRACT = process.env.SUI_CONTRACT || '';
const USDC_CONTRACT = process.env.USDC_CONTRACT || '';
const USDT_CONTRACT = process.env.USDT_CONTRACT || '';

async function executeSwap(client: SuiClient, keyPair: Ed25519Keypair, sender: string, walletAddress: string, tokenIn: string, tokenOut: string, amountIn: string): Promise<string> {
    try {
        const quoteResponse = await getQuote({
            tokenIn,
            tokenOut,
            amountIn,
        });

        const { tx } = await buildTx({
            quoteResponse,
            accountAddress: walletAddress,
            slippage: 0.01,
            commission: {
                partner: walletAddress,
                commissionBps: 0,
            },
        });

        tx.setSender(sender);
        tx.setGasBudget(20000000);

        const bytes = await tx.build({
            client,
        });
        const serializedSignature = (await keyPair.signTransaction(bytes)).signature;

        const verifySignature = await keyPair.getPublicKey().verifyTransaction(bytes, serializedSignature);
        if (!verifySignature) {
            throw new Error("Invalid signature");
        }

        const res = await client.executeTransactionBlock({
            transactionBlock: bytes,
            signature: serializedSignature,
        });

        return res.digest; // Return the transaction hash
    } catch (error) {
        console.error("Error in executeSwap:", error);
        throw error;
    }
}

async function getBalance(client: SuiClient, walletAddress: string, coinType: string): Promise<number> {
    const coins = await client.getCoins({ owner: walletAddress, coinType });
    return coins.data.reduce((total: number, coin: any) => total + Number(coin.balance), 0);
}

async function processWallet(client: SuiClient, walletIndex: number) {
    if (walletIndex >= WALLET_ADDRESSES.length || walletIndex >= SEED_PHRASES.length) {
        console.log(`\nNo more wallets to process. Processed ${walletIndex} wallets.`);
        return;
    }

    const walletAddress = WALLET_ADDRESSES[walletIndex];
    const seedPhrase = SEED_PHRASES[walletIndex];

    try {
        const keyPair = Ed25519Keypair.deriveKeypair(seedPhrase);
        const sender = keyPair.getPublicKey().toSuiAddress();

        console.log(`\nProcessing wallet ${walletIndex + 1}: ${walletAddress}`);

        // Get initial SUI balance
        let suiBalance = await getBalance(client, walletAddress, SUI_CONTRACT);
        console.log(`Initial SUI: ${(suiBalance / 1e9).toFixed(2)}`);

        // Calculate a random percentage between 30% and 50%
        const percentage = Math.random() * (50 - 30) + 30;
        const amountInSui = Math.floor(suiBalance * percentage / 100).toString();

        console.log(`Swapping ${percentage.toFixed(2)}% of SUI (${Number(amountInSui) / 1e9} SUI) to USDC...`);

        // SUI to USDC
        const suiToUsdcTxHash = await executeSwap(client, keyPair, sender, walletAddress, SUI_CONTRACT, USDC_CONTRACT, amountInSui);
        console.log(`Transaction Hash: https://suiscan.xyz/mainnet/tx/${suiToUsdcTxHash}`);
        await new Promise(resolve => setTimeout(resolve, 30000));

        // Get USDC balance
        let usdcBalance = await getBalance(client, walletAddress, USDC_CONTRACT);
        console.log(`USDC: ${(usdcBalance / 1e6).toFixed(2)}`);

        // USDC to USDT
        console.log("Swapping USDC to USDT...");
        const usdcToUsdtTxHash = await executeSwap(client, keyPair, sender, walletAddress, USDC_CONTRACT, USDT_CONTRACT, usdcBalance.toString());
        console.log(`Transaction Hash: https://suiscan.xyz/mainnet/tx/${usdcToUsdtTxHash}`);
        await new Promise(resolve => setTimeout(resolve, 30000));

        // Get USDT balance
        let usdtBalance = await getBalance(client, walletAddress, USDT_CONTRACT);
        console.log(`USDT: ${(usdtBalance / 1e6).toFixed(2)}`);

        // USDT to SUI
        console.log("Swapping USDT to SUI...");
        const usdtToSuiTxHash = await executeSwap(client, keyPair, sender, walletAddress, USDT_CONTRACT, SUI_CONTRACT, usdtBalance.toString());
        console.log(`Transaction Hash: https://suiscan.xyz/mainnet/tx/${usdtToSuiTxHash}`);
        await new Promise(resolve => setTimeout(resolve, 30000));

        // Get final SUI balance
        suiBalance = await getBalance(client, walletAddress, SUI_CONTRACT);
        console.log(`Final SUI: ${(suiBalance / 1e9).toFixed(2)}`);

        console.log("All swaps completed.");
    } catch (error) {
        console.error(`Error processing wallet ${walletIndex + 1}:`, error);
    }

    // Process next wallet
    await processWallet(client, walletIndex + 1);
}

async function main() {
    try {
        const client = new SuiClient({ url: getFullnodeUrl("mainnet") });
        await processWallet(client, 0);
    } catch (error) {
        console.error("Error in main:", error);
    }
}

// `execute` fonksiyonunu dışa aktar
export async function execute() {
    console.log('7kswap bot is running...');
    await main();
}
