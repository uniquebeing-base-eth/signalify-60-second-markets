// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title SignalifyPrediction
 * @notice 60-second UP/DOWN stock prediction market for Robinhood Chain.
 *
 * PORTED FROM the HyperWave `BloomBetting` contract. The mechanism is
 * intentionally unchanged:
 *   - continuous 60-second rounds
 *   - one prediction per wallet per round
 *   - predictions close 10 seconds before expiry
 *   - fixed 2x payout, draws count as losses
 *   - oracle-driven startRound / settleRound with write-once prices
 *   - instant payout on settlement with a solvency check
 *
 * WHAT CHANGED for Signalify / Robinhood Chain:
 *   1. Multi-asset: rounds are keyed by (assetId, roundId) so AAPL, TSLA,
 *      NVDA, MSFT and AMZN run their own continuous round sequences.
 *      Adding an asset is an owner call, not a redeploy.
 *   2. Token: BLOOM -> SGN (constructor arg, no hardcoded address).
 *   3. No Base-specific addresses or feeds are baked in. The authoritative
 *      price is pushed by the Signalify backend signer, which reads the
 *      configured Robinhood Chain price source off-chain (8 decimals).
 *   4. Nothing about the $5 SGN eligibility rule lives here: eligibility is a
 *      wallet-balance check only. SGN is never staked, locked or escrowed by
 *      this contract beyond the prediction stake itself.
 */
contract SignalifyPrediction is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Immutable config ============
    IERC20 public immutable sgnToken;
    uint256 public constant ROUND_DURATION = 60;
    uint256 public constant PREDICTION_CUTOFF = 10;
    uint256 public constant PAYOUT_MULTIPLIER = 2;

    uint256 public minimumStake = 1 * 10 ** 18; // configurable
    address public priceOracle; // backend signer address

    enum Direction {
        None,
        Up,
        Down
    }
    enum PredictionResult {
        Pending,
        Win,
        Lose
    }

    struct Round {
        uint256 roundId;
        bytes32 assetId;
        uint256 startTime;
        uint256 endTime;
        uint256 startPrice; // 8 decimals
        uint256 endPrice; // 8 decimals
        uint256 totalUpPool;
        uint256 totalDownPool;
        Direction result;
        bool resolved;
    }

    struct Prediction {
        uint256 predictionId;
        bytes32 assetId;
        uint256 roundId;
        address user;
        Direction direction;
        uint256 amount;
        uint256 timestamp;
        PredictionResult result;
        uint256 payout;
    }

    // ============ Storage ============
    bytes32[] public assetIds;
    mapping(bytes32 => bool) public assetEnabled;
    mapping(bytes32 => uint256) public currentRoundId; // per asset

    uint256 public nextPredictionId;
    bool public paused;

    mapping(bytes32 => mapping(uint256 => Round)) public rounds;
    mapping(bytes32 => mapping(uint256 => uint256[])) public roundPredictionIds;
    mapping(uint256 => Prediction) public predictionsById;
    mapping(address => uint256[]) public userPredictionIds;
    mapping(bytes32 => mapping(uint256 => mapping(address => bool))) public hasPredicted;

    // ============ Events ============
    event AssetListed(bytes32 indexed assetId, string symbol);
    event AssetEnabled(bytes32 indexed assetId, bool enabled);
    event RoundStarted(bytes32 indexed assetId, uint256 indexed roundId, uint256 startTime, uint256 startPrice);
    event PredictionPlaced(
        bytes32 indexed assetId,
        uint256 indexed roundId,
        uint256 indexed predictionId,
        address user,
        Direction direction,
        uint256 amount
    );
    event RoundSettled(bytes32 indexed assetId, uint256 indexed roundId, Direction result, uint256 endPrice, uint256 totalPayouts);
    event RoundCancelled(bytes32 indexed assetId, uint256 indexed roundId, uint256 totalRefunded);
    event OracleUpdated(address oldOracle, address newOracle);
    event MinimumStakeUpdated(uint256 oldMinimum, uint256 newMinimum);
    event Paused(bool isPaused);
    event HouseProfitsWithdrawn(address indexed to, uint256 amount);

    modifier onlyOracle() {
        require(msg.sender == priceOracle || msg.sender == owner(), "Not authorized oracle");
        _;
    }

    modifier notPaused() {
        require(!paused, "Signalify is paused");
        _;
    }

    constructor(address _sgnToken, address _priceOracle) Ownable(msg.sender) {
        require(_sgnToken != address(0), "Invalid SGN address");
        sgnToken = IERC20(_sgnToken);
        priceOracle = _priceOracle;
    }

    // ============ Asset registry (extensible, no redeploy) ============
    function listAsset(string calldata _symbol) external onlyOwner returns (bytes32 assetId) {
        assetId = keccak256(abi.encodePacked(_symbol));
        require(!assetEnabled[assetId], "Asset already listed");
        assetIds.push(assetId);
        assetEnabled[assetId] = true;
        emit AssetListed(assetId, _symbol);
    }

    function setAssetEnabled(bytes32 _assetId, bool _enabled) external onlyOwner {
        assetEnabled[_assetId] = _enabled;
        emit AssetEnabled(_assetId, _enabled);
    }

    function getAssetIds() external view returns (bytes32[] memory) {
        return assetIds;
    }

    // ============ Oracle-driven lifecycle ============
    function startRound(bytes32 _assetId, uint256 _startPrice) external onlyOracle notPaused {
        require(assetEnabled[_assetId], "Asset not enabled");
        require(_startPrice > 0, "Invalid start price");

        uint256 previous = currentRoundId[_assetId];
        if (previous > 0) {
            require(rounds[_assetId][previous].resolved, "Previous round unresolved");
        }

        uint256 roundId = previous + 1;
        currentRoundId[_assetId] = roundId;

        require(rounds[_assetId][roundId].startPrice == 0, "Start price already set");

        rounds[_assetId][roundId] = Round({
            roundId: roundId,
            assetId: _assetId,
            startTime: block.timestamp,
            endTime: block.timestamp + ROUND_DURATION,
            startPrice: _startPrice,
            endPrice: 0,
            totalUpPool: 0,
            totalDownPool: 0,
            result: Direction.None,
            resolved: false
        });

        emit RoundStarted(_assetId, roundId, block.timestamp, _startPrice);
    }

    function predict(bytes32 _assetId, Direction _direction, uint256 _amount) external nonReentrant notPaused {
        require(_direction == Direction.Up || _direction == Direction.Down, "Invalid direction");
        require(_amount >= minimumStake, "Below minimum stake");

        uint256 roundId = currentRoundId[_assetId];
        require(roundId > 0, "No active round");

        Round storage round = rounds[_assetId][roundId];
        require(!round.resolved, "Round already resolved");
        require(block.timestamp < round.endTime - PREDICTION_CUTOFF, "Round locked (final 10s)");
        require(!hasPredicted[_assetId][roundId][msg.sender], "Already predicted this round");
        hasPredicted[_assetId][roundId][msg.sender] = true;

        sgnToken.safeTransferFrom(msg.sender, address(this), _amount);

        if (_direction == Direction.Up) {
            round.totalUpPool += _amount;
        } else {
            round.totalDownPool += _amount;
        }

        nextPredictionId++;
        predictionsById[nextPredictionId] = Prediction({
            predictionId: nextPredictionId,
            assetId: _assetId,
            roundId: roundId,
            user: msg.sender,
            direction: _direction,
            amount: _amount,
            timestamp: block.timestamp,
            result: PredictionResult.Pending,
            payout: 0
        });
        roundPredictionIds[_assetId][roundId].push(nextPredictionId);
        userPredictionIds[msg.sender].push(nextPredictionId);

        emit PredictionPlaced(_assetId, roundId, nextPredictionId, msg.sender, _direction, _amount);
    }

    function settleRound(bytes32 _assetId, uint256 _roundId, uint256 _endPrice) external onlyOracle notPaused {
        Round storage round = rounds[_assetId][_roundId];
        require(round.startTime > 0, "Round does not exist");
        require(!round.resolved, "Already resolved");
        require(block.timestamp >= round.endTime, "Round not ended yet");
        require(_endPrice > 0, "Invalid end price");
        require(round.endPrice == 0, "End price already set");

        round.endPrice = _endPrice;

        if (_endPrice > round.startPrice) {
            round.result = Direction.Up;
        } else if (_endPrice < round.startPrice) {
            round.result = Direction.Down;
        } else {
            round.result = Direction.None; // draw = loss
        }

        uint256[] storage ids = roundPredictionIds[_assetId][_roundId];

        uint256 required = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            Prediction storage p = predictionsById[ids[i]];
            if (round.result != Direction.None && p.direction == round.result) {
                required += p.amount * PAYOUT_MULTIPLIER;
            }
        }
        require(sgnToken.balanceOf(address(this)) >= required, "House insufficient liquidity");

        round.resolved = true;

        uint256 totalPayouts = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            Prediction storage p = predictionsById[ids[i]];
            if (round.result != Direction.None && p.direction == round.result) {
                uint256 payout = p.amount * PAYOUT_MULTIPLIER;
                p.payout = payout;
                p.result = PredictionResult.Win;
                sgnToken.safeTransfer(p.user, payout);
                totalPayouts += payout;
            } else {
                p.result = PredictionResult.Lose;
                p.payout = 0;
            }
        }

        emit RoundSettled(_assetId, _roundId, round.result, _endPrice, totalPayouts);
    }

    /// @notice Emergency refund of an unresolved round.
    function cancelRound(bytes32 _assetId, uint256 _roundId) external onlyOwner nonReentrant {
        Round storage round = rounds[_assetId][_roundId];
        require(round.startTime > 0, "Round does not exist");
        require(!round.resolved, "Already resolved");

        uint256[] storage ids = roundPredictionIds[_assetId][_roundId];
        uint256 refunded = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            Prediction storage p = predictionsById[ids[i]];
            if (p.result == PredictionResult.Pending && p.amount > 0) {
                p.result = PredictionResult.Lose;
                p.payout = p.amount;
                sgnToken.safeTransfer(p.user, p.amount);
                refunded += p.amount;
            }
        }
        round.resolved = true;
        emit RoundCancelled(_assetId, _roundId, refunded);
    }

    // ============ Views ============
    function isPredictionOpen(bytes32 _assetId) public view returns (bool) {
        uint256 roundId = currentRoundId[_assetId];
        if (roundId == 0 || paused) return false;
        Round storage round = rounds[_assetId][roundId];
        return !round.resolved && block.timestamp < round.endTime - PREDICTION_CUTOFF;
    }

    function getTimeRemaining(bytes32 _assetId) external view returns (uint256) {
        uint256 roundId = currentRoundId[_assetId];
        if (roundId == 0) return 0;
        Round storage round = rounds[_assetId][roundId];
        if (round.resolved || block.timestamp >= round.endTime) return 0;
        return round.endTime - block.timestamp;
    }

    function getRound(bytes32 _assetId, uint256 _roundId) external view returns (Round memory) {
        return rounds[_assetId][_roundId];
    }

    function getCurrentRound(bytes32 _assetId) external view returns (Round memory) {
        return rounds[_assetId][currentRoundId[_assetId]];
    }

    function getRoundPredictions(bytes32 _assetId, uint256 _roundId) external view returns (Prediction[] memory) {
        uint256[] storage ids = roundPredictionIds[_assetId][_roundId];
        Prediction[] memory list = new Prediction[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            list[i] = predictionsById[ids[i]];
        }
        return list;
    }

    function getUserPredictionIds(address _user) external view returns (uint256[] memory) {
        return userPredictionIds[_user];
    }

    function getHouseBalance() external view returns (uint256) {
        return sgnToken.balanceOf(address(this));
    }

    // ============ Admin ============
    function setOracle(address _oracle) external onlyOwner {
        emit OracleUpdated(priceOracle, _oracle);
        priceOracle = _oracle;
    }

    function setMinimumStake(uint256 _minimumStake) external onlyOwner {
        emit MinimumStakeUpdated(minimumStake, _minimumStake);
        minimumStake = _minimumStake;
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit Paused(_paused);
    }

    function withdrawHouseProfits(address _to, uint256 _amount) external onlyOwner nonReentrant {
        require(_to != address(0), "Invalid recipient");
        sgnToken.safeTransfer(_to, _amount);
        emit HouseProfitsWithdrawn(_to, _amount);
    }

    function assetIdFor(string calldata _symbol) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(_symbol));
    }
}
