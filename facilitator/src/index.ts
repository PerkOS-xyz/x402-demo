import { x402Facilitator } from "@x402/core/facilitator";
import {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  VerifyResponse,
} from "@x402/core/types";
import { toFacilitatorEvmSigner } from "@x402/evm";
import { registerExactEvmScheme } from "@x402/evm/exact/facilitator";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

dotenv.config();

// Configuration
const PORT = process.env.PORT || "3005";

// Validate required environment variables
if (!process.env.EVM_PRIVATE_KEY) {
  console.error("❌ EVM_PRIVATE_KEY environment variable is required");
  process.exit(1);
}

// Initialize the EVM account from private key
const evmAccount = privateKeyToAccount(
  process.env.EVM_PRIVATE_KEY as `0x${string}`
);

console.log("\n" + "═".repeat(60));
console.log("           x402 FACILITATOR - Payment Processor");
console.log("═".repeat(60));
console.log(`\n🔑 Facilitator Wallet: ${evmAccount.address}`);
console.log(`🌐 Network: Ethereum Sepolia (eip155:11155111)`);

// Create a Viem client with both wallet and public capabilities
const viemClient = createWalletClient({
  account: evmAccount,
  chain: sepolia,
  transport: http(),
}).extend(publicActions);

// Initialize the EVM signer for the facilitator
const evmSigner = toFacilitatorEvmSigner({
  getCode: (args: { address: `0x${string}` }) => viemClient.getCode(args),
  address: evmAccount.address,
  readContract: (args: {
    address: `0x${string}`;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
  }) =>
    viemClient.readContract({
      ...args,
      args: args.args || [],
    }),
  verifyTypedData: (args: {
    address: `0x${string}`;
    domain: Record<string, unknown>;
    types: Record<string, unknown>;
    primaryType: string;
    message: Record<string, unknown>;
    signature: `0x${string}`;
  }) => viemClient.verifyTypedData(args as any),
  writeContract: (args: {
    address: `0x${string}`;
    abi: readonly unknown[];
    functionName: string;
    args: readonly unknown[];
  }) =>
    viemClient.writeContract({
      ...args,
      args: args.args || [],
    }),
  sendTransaction: (args: { to: `0x${string}`; data: `0x${string}` }) =>
    viemClient.sendTransaction(args),
  waitForTransactionReceipt: (args: { hash: `0x${string}` }) =>
    viemClient.waitForTransactionReceipt(args),
});

// Initialize the x402 Facilitator with detailed logging
const facilitator = new x402Facilitator()
  .onBeforeVerify(async (context) => {
    console.log("\n" + "─".repeat(60));
    console.log("📋 [VERIFY] Step 1: Received verification request");
    console.log("─".repeat(60));
    console.log(`   Network: ${context.requirements.network}`);
    console.log(`   Amount: ${context.requirements.amount} (atomic units)`);
    console.log(`   Asset: ${context.requirements.asset}`);
    console.log(`   Pay To: ${context.requirements.payTo}`);
    console.log("\n   🔍 Validating EIP-3009 signature...");
    console.log("   🔍 Checking payer balance...");
    console.log("   🔍 Verifying authorization parameters...");
  })
  .onAfterVerify(async (context) => {
    console.log("\n📋 [VERIFY] Step 2: Verification complete");
    if (context.result.isValid) {
      console.log(`   ✅ Signature VALID`);
      console.log(`   👤 Payer: ${context.result.payer}`);
    } else {
      console.log(`   ❌ Signature INVALID: ${context.result.invalidReason}`);
    }
    console.log("─".repeat(60));
  })
  .onVerifyFailure(async (context) => {
    console.log("\n❌ [VERIFY] Verification FAILED");
    console.log(`   Error: ${context.error.message}`);
    console.log("─".repeat(60));
  })
  .onBeforeSettle(async (context) => {
    console.log("\n" + "─".repeat(60));
    console.log("💰 [SETTLE] Step 1: Received settlement request");
    console.log("─".repeat(60));
    console.log(`   Network: ${context.requirements.network}`);
    console.log(`   Amount: ${context.requirements.amount} (atomic units)`);
    console.log("\n   📝 Preparing transferWithAuthorization transaction...");
    console.log("   🔗 Submitting to Ethereum Sepolia...");
  })
  .onAfterSettle(async (context) => {
    console.log("\n💰 [SETTLE] Step 2: Settlement complete");
    if (context.result.success) {
      console.log(`   ✅ Transaction SUCCESS`);
      console.log(`   📜 TX Hash: ${context.result.transaction}`);
      console.log(`   🌐 Network: ${context.result.network}`);
      console.log(`   👤 Payer: ${context.result.payer}`);
    } else {
      console.log(`   ❌ Transaction FAILED: ${context.result.errorReason}`);
    }
    console.log("─".repeat(60));
  })
  .onSettleFailure(async (context) => {
    console.log("\n❌ [SETTLE] Settlement FAILED");
    console.log(`   Error: ${context.error.message}`);
    console.log("─".repeat(60));
  });

// Register EVM scheme for Sepolia
registerExactEvmScheme(facilitator, {
  signer: evmSigner,
  networks: "eip155:11155111", // Ethereum Sepolia
  deployERC4337WithEIP6492: true,
});

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json());

/**
 * POST /verify
 * Verify a payment against requirements
 */
app.post("/verify", async (req, res) => {
  console.log("\n📨 [HTTP] POST /verify - Request received");
  
  try {
    const { paymentPayload, paymentRequirements } = req.body as {
      paymentPayload: PaymentPayload;
      paymentRequirements: PaymentRequirements;
    };

    if (!paymentPayload || !paymentRequirements) {
      console.log("   ❌ Missing required fields");
      return res.status(400).json({
        error: "Missing paymentPayload or paymentRequirements",
      });
    }

    const response: VerifyResponse = await facilitator.verify(
      paymentPayload,
      paymentRequirements
    );

    console.log("📤 [HTTP] POST /verify - Response sent");
    res.json(response);
  } catch (error) {
    console.error("   ❌ Verify error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * POST /settle
 * Settle a payment on-chain
 */
app.post("/settle", async (req, res) => {
  console.log("\n📨 [HTTP] POST /settle - Request received");
  
  try {
    const { paymentPayload, paymentRequirements } = req.body;

    if (!paymentPayload || !paymentRequirements) {
      console.log("   ❌ Missing required fields");
      return res.status(400).json({
        error: "Missing paymentPayload or paymentRequirements",
      });
    }

    const response: SettleResponse = await facilitator.settle(
      paymentPayload as PaymentPayload,
      paymentRequirements as PaymentRequirements
    );

    console.log("📤 [HTTP] POST /settle - Response sent");
    res.json(response);
  } catch (error) {
    console.error("   ❌ Settle error:", error);

    if (
      error instanceof Error &&
      error.message.includes("Settlement aborted:")
    ) {
      return res.json({
        success: false,
        errorReason: error.message.replace("Settlement aborted: ", ""),
        network: req.body?.paymentPayload?.network || "unknown",
      } as SettleResponse);
    }

    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /supported
 * Get supported payment kinds and extensions
 */
app.get("/supported", async (req, res) => {
  console.log("\n📨 [HTTP] GET /supported - Request received");
  
  try {
    const response = facilitator.getSupported();
    console.log(`   Supported networks: ${response.kinds.length}`);
    res.json(response);
  } catch (error) {
    console.error("   ❌ Supported error:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /health
 * Health check endpoint
 */
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    facilitator: evmAccount.address,
    network: "eip155:11155111",
    chain: "sepolia",
  });
});

// Start the server
app.listen(parseInt(PORT), () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log(`\n📡 Endpoints:`);
  console.log(`   POST /verify    - Verify payment signature`);
  console.log(`   POST /settle    - Execute payment on-chain`);
  console.log(`   GET  /supported - List supported networks`);
  console.log(`   GET  /health    - Health check`);
  console.log("\n" + "═".repeat(60));
  console.log("   Waiting for requests...");
  console.log("═".repeat(60) + "\n");
});
