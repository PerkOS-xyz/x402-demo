import { config } from "dotenv";
import express from "express";
import cors from "cors";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";

config();

// Configuration
const PORT = process.env.PORT || "3002";
const evmAddress = process.env.EVM_ADDRESS as `0x${string}`;
const facilitatorUrl = process.env.FACILITATOR_URL;

// Validate required environment variables
if (!evmAddress) {
  console.error("❌ EVM_ADDRESS environment variable is required");
  process.exit(1);
}

if (!facilitatorUrl) {
  console.error("❌ FACILITATOR_URL environment variable is required");
  process.exit(1);
}

console.log("\n" + "═".repeat(60));
console.log("           x402 VENDOR - Resource Server");
console.log("═".repeat(60));
console.log(`\n💰 Receiving payments at: ${evmAddress}`);
console.log(`🔗 Facilitator URL: ${facilitatorUrl}`);
console.log(`🌐 Network: Ethereum Sepolia (eip155:11155111)`);

// Initialize the facilitator client
const facilitatorClient = new HTTPFacilitatorClient({ url: facilitatorUrl });

// Initialize Express app
const app = express();
app.use(cors());

// Custom logging middleware
app.use((req, res, next) => {
  if (req.path === "/api/hello") {
    const hasPayment = req.headers["payment-signature"] || req.headers["x-payment"];
    
    console.log("\n" + "─".repeat(60));
    console.log(`📨 [HTTP] ${req.method} ${req.path}`);
    console.log("─".repeat(60));
    
    if (hasPayment) {
      console.log("   💳 Payment signature detected in header");
      console.log("   🔄 Processing paid request...");
    } else {
      console.log("   ⚠️  No payment signature in request");
      console.log("   📋 Will return 402 Payment Required");
    }
  }
  next();
});

// Apply x402 payment middleware to protected routes
app.use(
  paymentMiddleware(
    {
      // Protected endpoint: GET /api/hello
      "GET /api/hello": {
        accepts: [
          {
            scheme: "exact",
            network: "eip155:11155111", // Ethereum Sepolia
            price: {
              asset: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // USDC on Sepolia
              amount: "100000", // 0.1 USDC (6 decimals)
              extra: {
                name: "USDC",
                version: "2",
              },
            },
            payTo: evmAddress,
            maxTimeoutSeconds: 60,
          },
        ],
        description: "Hello World API - Returns a simple greeting",
        mimeType: "application/json",
      },
    },
    new x402ResourceServer(facilitatorClient).register(
      "eip155:11155111",
      new ExactEvmScheme()
    )
  )
);

// Parse JSON for non-protected routes
app.use(express.json());

/**
 * GET /api/hello
 * Protected endpoint - requires x402 payment
 */
app.get("/api/hello", (req, res) => {
  console.log("\n" + "─".repeat(60));
  console.log("✅ [PROTECTED] Payment verified - Serving content");
  console.log("─".repeat(60));
  console.log("   📦 Returning: { data: 'Hello World' }");
  console.log("   💵 Payment: 0.1 USDC");
  console.log("   🔄 Facilitator will settle on-chain...");
  
  res.json({
    data: "Hello World",
    timestamp: new Date().toISOString(),
    message: "This response was paid for via x402!",
  });
});

/**
 * GET /health
 * Health check endpoint (not protected)
 */
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    vendor: evmAddress,
    facilitator: facilitatorUrl,
    network: "eip155:11155111",
    chain: "sepolia",
  });
});

/**
 * GET /api/info
 * Public endpoint - no payment required
 */
app.get("/api/info", (req, res) => {
  console.log("\n📨 [HTTP] GET /api/info - Public endpoint");
  
  res.json({
    name: "x402 Demo Vendor",
    version: "1.0.0",
    protectedEndpoints: [
      {
        method: "GET",
        path: "/api/hello",
        price: "0.1 USDC",
        network: "Ethereum Sepolia",
      },
    ],
  });
});

// Start the server
app.listen(parseInt(PORT), () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log(`\n📡 Endpoints:`);
  console.log(`   GET /api/hello  - Protected (0.1 USDC)`);
  console.log(`   GET /api/info   - Public (free)`);
  console.log(`   GET /health     - Health check`);
  console.log("\n" + "═".repeat(60));
  console.log("   Waiting for requests...");
  console.log("═".repeat(60) + "\n");
});
