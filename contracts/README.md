# Signalify contracts

`SignalifyPrediction.sol` is the HyperWave `BloomBetting` mechanism ported to
Robinhood Chain: same continuous 60-second rounds, one prediction per wallet per
round, 10-second lock before expiry, fixed 2× payout, draws count as losses,
instant payout on settlement, oracle-pushed write-once start/end prices.

## Audit map (HyperWave → Signalify)

| HyperWave component | Action | Notes |
| --- | --- | --- |
| `BloomBetting` round lifecycle (`startRound`/`settleRound`) | **Keep** | Logic unchanged, now keyed per asset |
| Payout maths (2×, draw = loss, solvency check) | **Keep** | Untouched |
| One-bet-per-round guard, 10s cutoff, pause, emergency cancel | **Keep** | Untouched |
| BLOOM token | **Modify** | Constructor takes the SGN address; nothing hardcoded |
| Single ETH/USD market | **Modify** | Rounds keyed by `assetId = keccak256(symbol)`; assets listed by owner |
| Base Chainlink ETH/USD aggregator address | **Replace** | Base-specific; price now comes from the configured Robinhood Chain source and is pushed by the backend signer |
| Base RPC / chain id 8453 in `wagmiConfig` | **Replace** | Env-driven Robinhood Chain config (`CHAIN_ID`, `RPC_URL`, `EXPLORER_URL`) |
| Farcaster mini-app wallet connector | **Replace** | Robinhood Chain–compatible EVM wallet connect |
| `oracle-automation` edge function | **Modify** | Now a server route + server functions; same start/settle duty cycle |
| `sign-claim-rewards` signer pattern | **Keep** | Private key stays server-side only |
| BLOOM rewards / tipping / leaderboard / Farcaster share | **Drop for MVP** | Out of scope per spec |

## Deploy to Robinhood Chain testnet

Robinhood Chain is an Arbitrum L2 with ETH gas and is fully EVM compatible, so
standard Foundry/Hardhat deployment works unmodified.

| Property | Testnet | Mainnet |
| --- | --- | --- |
| Chain ID | 46630 | 4663 |
| Gas token | ETH | ETH |

Set `RPC_URL`, `EXPLORER_URL` and `CHAIN_ID` from the official network table at
<https://docs.robinhood.com/chain/connecting/> — never hardcode them in app code.

```bash
forge create contracts/SignalifyPrediction.sol:SignalifyPrediction \
  --rpc-url "$RPC_URL" \
  --private-key "$DEPLOYER_PRIVATE_KEY" \
  --constructor-args "$SGN_TOKEN_ADDRESS" "$BACKEND_SIGNER_ADDRESS"
```

Then, once per launch asset:

```bash
cast send "$PREDICTION_CONTRACT_ADDRESS" "listAsset(string)" AAPL \
  --rpc-url "$RPC_URL" --private-key "$DEPLOYER_PRIVATE_KEY"
# repeat for TSLA NVDA MSFT AMZN
```

Fund the contract with SGN so it can cover 2× payouts, then put the deployed
address in `PREDICTION_CONTRACT_ADDRESS` / `VITE_PREDICTION_CONTRACT_ADDRESS`.

The backend signer address passed as `_priceOracle` is the only account allowed
to call `startRound` / `settleRound`. Its private key lives in
`BACKEND_SIGNER_PRIVATE_KEY` server-side only and is never sent to the browser.
