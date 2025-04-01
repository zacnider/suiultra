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

        // Define swap routes
        const swapRoutes = [
            { tokenIn: SUI_CONTRACT, tokenOut: USDC_CONTRACT, amountIn: amountInSui },
            { tokenIn: USDC_CONTRACT, tokenOut: SUI_CONTRACT, amountIn: '0' }, // Amount will be set later
            { tokenIn: SUI_CONTRACT, tokenOut: USDT_CONTRACT, amountIn: amountInSui },
            { tokenIn: USDT_CONTRACT, tokenOut: SUI_CONTRACT, amountIn: '0' }, // Amount will be set later
        ];

        // Execute swaps
        for (const route of swapRoutes) {
            if (route.tokenIn === SUI_CONTRACT) {
                // For SUI to other token swaps, use the calculated amount
                console.log(`Swapping ${percentage.toFixed(2)}% of SUI (${Number(route.amountIn) / 1e9} SUI) to ${route.tokenOut}...`);
                const txHash = await executeSwap(client, keyPair, sender, walletAddress, route.tokenIn, route.tokenOut, route.amountIn);
                console.log(`Transaction Hash: https://suiscan.xyz/mainnet/tx/${txHash}`);
            } else {
                // For other token to SUI swaps, get the balance of the token first
                const tokenBalance = await getBalance(client, walletAddress, route.tokenIn);
                if (tokenBalance > 0) {
                    console.log(`Swapping all ${route.tokenIn} to SUI...`);
                    const txHash = await executeSwap(client, keyPair, sender, walletAddress, route.tokenIn, route.tokenOut, tokenBalance.toString());
                    console.log(`Transaction Hash: https://suiscan.xyz/mainnet/tx/${txHash}`);
                } else {
                    console.log(`No ${route.tokenIn} balance to swap.`);
                }
            }

            // Wait for 15 seconds before the next swap
            await new Promise(resolve => setTimeout(resolve, 15000));
        }

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
