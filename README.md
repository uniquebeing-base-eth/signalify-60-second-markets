# Signalify: 60-Second Markets

Build Signalify — 60-Second Prediction Market on Robinhood Chain

PRODUCT

Build Signalify, a fast 60-second stock prediction market built on Robinhood Chain.

Tagline:

The fastest prediction market on Robinhood Chain.

Core experience:

Pick a stock → predict UP or DOWN → wait 60 seconds → win 2× if correct.

The starting point for this project is the existing HyperWave Predict repository:

https://github.com/uniquebeing-base-eth/hyperwave-predict

IMPORTANT: Do NOT rebuild the prediction-market mechanism from scratch.

First inspect the existing repository thoroughly. Reuse its working prediction-market contracts, market lifecycle, backend signer architecture, settlement logic, frontend patterns, and other components wherever technically compatible.

The objective is to port/adapt the existing mechanism to Robinhood Chain and rebrand it as Signalify, not create a completely new prediction market architecture.



1. FIRST: AUDIT THE HYPERWAVE REPOSITORY

Before making major changes, inspect:

Smart contracts

Contract deployment scripts

Backend/server code

Backend signer implementation

Frontend

Market creation logic

Market expiration logic

UP/DOWN position logic

Settlement logic

Payout calculation

Token interactions

Oracle/price-resolution mechanism

Base-specific dependencies

RPC configuration

Chain IDs

Hardcoded contract addresses

Environment variables

Admin functionality

Transaction handling

Create an internal map of:

Existing HyperWave component

        ↓

Keep unchanged

        ↓

Modify

        ↓

Replace because Base-specific

Do not unnecessarily rewrite working code.



2. PRODUCT NAME

The application name is:

Signalify

Do NOT call the application HyperWave.

HyperWave is only the technical starting point/repository.

The product branding must become Signalify throughout:

UI

metadata

page titles

documentation

wallet messages

errors

navigation

loading states

transaction messages

social sharing

deployment configuration where appropriate



3. BLOCKCHAIN

Move the application from Base to Robinhood Chain.

Develop against Robinhood Chain testnet first.

Robinhood Chain documentation:

https://docs.robinhood.com/chain/

Account abstraction documentation:

https://docs.robinhood.com/chain/account-abstraction/

Smart contract deployment documentation:

https://docs.robinhood.com/chain/deploy-smart-contracts/

Connecting to Robinhood Chain:

https://docs.robinhood.com/chain/connecting/

Do not assume Base-specific infrastructure works unchanged on Robinhood Chain.

Identify every Base dependency and replace it with the appropriate Robinhood Chain equivalent.

Make all network configuration environment-driven.

At minimum, configuration should support:

RPC_URL=

CHAIN_ID=

EXPLORER_URL=

SGN_TOKEN_ADDRESS=

PREDICTION_CONTRACT_ADDRESS=

BACKEND_SIGNER_PRIVATE_KEY=

ORACLE_CONFIGURATION=

Never expose the backend private key to the frontend.



4. SGN TOKEN

The platform token is:

SGN

The actual SGN contract address must be configurable through environment variables.

Do NOT hardcode the token address throughout the application.

Use:

SGN_TOKEN_ADDRESS=

The application should query the user’s SGN balance directly from their Robinhood Chain wallet.



5. $5 SGN ACCESS REQUIREMENT

Users must hold at least $5 worth of SGN to access prediction markets.

This is an eligibility requirement only.

IMPORTANT:

The $5 SGN does NOT get:

staked

locked

escrowed

transferred

deposited into the prediction contract

consumed

used as the prediction amount

It remains completely in the user’s wallet.

The application simply checks:

SGN wallet balance

        ↓

Calculate USD value

        ↓

Is value >= $5?

        ↓

YES → prediction access

NO → prediction access locked

Example:

User has:

$37.42 worth of SGN

They are eligible.

User has:

$4.82 worth of SGN

They cannot participate until their wallet reaches the $5 threshold.

Do not create a separate staking contract for this requirement.



6. PREDICTION MECHANISM

Preserve the HyperWave mechanism wherever possible.

Markets operate in continuous 60-second rounds.

Example:

AAPL



Current Price

$241.38



ROUND #1842



00:37



Will the price be higher

or lower at expiration?



[ UP ↑ ]     [ DOWN ↓ ]

Users choose:

UP

DOWN

They enter the prediction amount.

The existing HyperWave mechanism should handle the actual prediction position and settlement.

If the user correctly predicts the direction:

2× payout

If incorrect:

prediction amount is lost

Do not modify the existing payout mechanics unless required by the Robinhood Chain implementation.



7. STOCK MARKETS

The initial product should focus on highly recognizable liquid stocks.

Initial markets:

AAPL

TSLA

NVDA

MSFT

AMZN

Structure the market system so additional assets can be added later without rewriting the application.

Do NOT build 100+ markets for the MVP.

Start with a small number of markets and make the architecture extensible.



8. PRICE RESOLUTION

This is critical.

Do NOT resolve markets based on the price displayed by the frontend.

The frontend price is informational only.

The backend/contract settlement mechanism must use a deterministic authoritative price source.

Investigate the appropriate Robinhood Chain / Chainlink infrastructure for stock pricing.

Robinhood Chain stock-token documentation:

https://docs.robinhood.com/chain/stock-tokens/

Robinhood Chain / Chainlink Data Streams documentation should also be evaluated for high-frequency price resolution.

The market should store something equivalent to:

marketId

asset

startTimestamp

endTimestamp

startPrice

endPrice

outcome

status

Example:

Market #1842



Asset: AAPL



Start:

$241.38

12:01:00



End:

$241.61

12:02:00



Result:

UP

The market must have one authoritative result.



9. CONTINUOUS MARKETS

When a 60-second market ends, the next market should automatically become available.

Example:

AAPL Round #1842

00:00

        ↓

Settlement

        ↓

AAPL Round #1843

01:00

        ↓

Settlement

        ↓

AAPL Round #1844

The user should never feel like they are waiting for a new market.

The product should feel continuous and extremely fast.



10. BACKEND SIGNER

Preserve the existing HyperWave backend signer architecture where possible.

The backend signer must be responsible for operations that require privileged signing.

The private key must ONLY exist server-side.

Never:

frontend → private key

Correct:

Frontend

   ↓

Backend API

   ↓

Backend signer

   ↓

Robinhood Chain

Configure the signer using environment variables.

Do not hardcode credentials.



11. SMART CONTRACTS

Use the existing HyperWave contracts as the starting point.

Do not automatically rewrite them.

Determine which contracts can be directly ported and which parts require modification because of:

Base-specific addresses

Base-specific infrastructure

Oracle dependencies

Chain IDs

token addresses

deployment assumptions

The final contracts should support the existing prediction mechanism on Robinhood Chain.

Conceptually, the system needs to support:

create market

        ↓

accept predictions

        ↓

close market

        ↓

resolve outcome

        ↓

calculate payout

        ↓

claim/settle winnings

Do not introduce unnecessary contract complexity.



12. WALLET / AUTHENTICATION

Use Robinhood Chain-compatible wallet/account infrastructure.

If the existing HyperWave wallet flow can be adapted, reuse it.

Do not create an unnecessary custom wallet system.

The user should have a simple experience:

Connect / Create Wallet

        ↓

Signalify

        ↓

Check SGN balance

        ↓

Access markets

If Robinhood Chain account abstraction is appropriate for the intended wallet experience, use the official Robinhood Chain-compatible implementation rather than building a custom account abstraction system.



13. FRONTEND DESIGN

The UI should feel like a premium modern financial product.

Design direction:

dark background

black / deep charcoal surfaces

bright green accent

clean typography

strong financial dashboard aesthetic

minimal visual clutter

large stock price

extremely visible countdown

obvious UP/DOWN actions

smooth transitions

mobile-first

The green accent can be inspired by the visual language associated with Robinhood, but do not copy Robinhood’s logo, proprietary assets, or branding.

Signalify must have its own identity.



14. SIGNALIFY HOME SCREEN

Primary screen:

SIGNALIFY



Your SGN

$127.42



────────────────────



LIVE MARKETS



AAPL

$241.38

+0.31%



00:42



        UP ↑

        DOWN ↓



────────────────────



TSLA

$348.12

-0.18%



00:42



        UP ↑

        DOWN ↓



────────────────────



NVDA

$178.42

+0.82%



00:42



        UP ↑

        DOWN ↓

The most important information should be visible immediately:

Stock

Current price

Direction

Countdown

UP/DOWN actions



15. PREDICTION FLOW

When the user taps UP or DOWN:

Open a compact prediction panel.

Example:

AAPL



Will AAPL be higher

in 60 seconds?



$241.38



          00:31



        UP ↑



Amount



10 SGN

25 SGN

50 SGN

100 SGN



Custom amount



Potential payout



200 SGN



[ PREDICT UP ]

For DOWN:

[ PREDICT DOWN ]

Make the interaction extremely fast.

The user should be able to go from:

Market

→ Direction

→ Amount

→ Confirm

with minimal friction.



16. ELIGIBILITY UI

If the user does not have $5 worth of SGN:

Prediction Locked



Hold at least $5 worth

of SGN to participate.



Your SGN

$4.82



Required

$5.00



[ GET SGN ]

If eligible:

✓ Prediction access unlocked

Do not tell users they need to “stake $5.”

They only need to hold it.



17. LIVE ROUND STATE

The UI should clearly communicate:

LIVE

ENDING SOON

CLOSED

RESOLVING

UP WON

DOWN WON

Avoid ambiguous states.



18. RESULT SCREEN

Example:

AAPL



UP WON



Start

$241.38



End

$241.61



────────────────



Your prediction

UP



Stake

100 SGN



Payout

200 SGN



+100 SGN



[ PREDICT NEXT ]

Immediately direct the user toward the next active market.

The goal is continuous engagement.



19. TRANSACTION UX

Transactions should never leave the user wondering what is happening.

Show:

Confirming...

then:

Prediction submitted ✓

and finally:

Round #1842

UP

100 SGN

Handle:

rejected transactions

insufficient SGN

insufficient gas

expired markets

market already closed

failed settlement

network errors

with clear human-readable messages.



20. MVP — DO NOT BUILD THESE

Do NOT expand the scope unnecessarily.

No:

user-created markets

sports

parlays

NFTs

governance

referrals

complicated social feed

DAO

token staking

token farming

multiple chains

mobile native application

complicated order book

unnecessary bridge

custom DEX

custom oracle

custom blockchain

unnecessary wallet infrastructure

The MVP is:

Robinhood Chain

        ↓

Signalify

        ↓

SGN eligibility check

        ↓

Stock markets

        ↓

60-second UP/DOWN prediction

        ↓

Existing HyperWave mechanism

        ↓

Settlement

        ↓

2× payout



21. DEVELOPMENT PRINCIPLE

Reuse before rebuilding.

Before writing a new component, contract, API, or service, check whether the HyperWave repository already contains a working implementation.

Preserve existing functionality unless there is a concrete reason to change it.

Do not refactor unrelated parts of the codebase.

Do not remove working infrastructure simply to introduce a different architecture.

Keep the project deployable throughout development.



22. ENVIRONMENT CONFIGURATION

All deployment-specific values must be configurable.

Example:

RPC_URL=

CHAIN_ID=

EXPLORER_URL=



SGN_TOKEN_ADDRESS=



PREDICTION_CONTRACT_ADDRESS=



BACKEND_SIGNER_PRIVATE_KEY=



ORACLE_ADDRESS=

ORACLE_CONFIG=



DATABASE_URL=

Use the appropriate variable names based on the existing HyperWave architecture.

Never commit secrets.

Provide a .env.example.



23. DEVELOPMENT ORDER

Build in this order:

Phase 1 — Repository audit

Understand HyperWave completely.

Phase 2 — Robinhood Chain testnet

Configure:

RPC

chain ID

explorer

wallet

deployment

Phase 3 — Contracts

Port/adapt the existing prediction contracts.

Phase 4 — SGN

Configure SGN token.

Implement the $5 wallet-balance eligibility check.

Phase 5 — Backend signer

Configure and test server-side signing.

Phase 6 — Price resolution

Implement/test authoritative stock-price resolution.

Phase 7 — Market engine

Implement continuous 60-second markets.

Phase 8 — Frontend

Build the Signalify interface.

Phase 9 — End-to-end testing

Test:

wallet

→ SGN balance

→ eligibility

→ market

→ prediction

→ expiry

→ resolution

→ payout

Phase 10 — Testnet launch

Do a complete testnet run before considering mainnet.



24. SUCCESS CRITERIA

The MVP is complete when a new user can:

Open Signalify.

Connect/create their Robinhood Chain-compatible wallet.

Have their SGN balance checked.

Be blocked if they hold less than $5 worth of SGN.

See live stock markets.

Choose UP or DOWN.

Enter a prediction amount.

Submit the prediction.

Watch the 60-second countdown.

Have the market resolve using the authoritative price mechanism.

Automatically receive the appropriate payout if they win.

Immediately enter the next 60-second market.

The entire experience should feel fast, simple, and addictive.

The core product is not “a complicated prediction platform.”

It is:

Signalify — predict the market every 60 seconds.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/d278cebd-318d-4363-a003-b71f8fb17b47).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
