const { Gateway, Wallets } = require('fabric-network');
const fsPromises = require('fs/promises');
const fs = require('fs');
const path = require('path');
const CircuitBreaker = require('opossum');
const { redisClient } = require('../db/index.js');
const logger = require('../utils/logger.js');
const {
    fabricCallLatencyMs,
    fabricCircuitOpen,
} = require('./observability.service.js');


class FabricService {
    constructor() {
        this.gateway = null;
        this.wallet = null;
        this.network = null;
        this.contract = null;
        this.channelName = process.env.FABRIC_CHANNEL_NAME || 'election-channel';
        this.chaincodeName = process.env.FABRIC_CHAINCODE_NAME || 'voting';
        this.degradedUntil = 0;
        this.failureCount = 0;
        this.breakers = new Map();
    }

    isCircuitOpen() {
        return Date.now() < this.degradedUntil;
    }

    markFailure() {
        this.failureCount += 1;
        const threshold = Number(process.env.FABRIC_CIRCUIT_FAILURE_THRESHOLD || 3);
        if (this.failureCount >= threshold) {
            const coolDownMs = Number(process.env.FABRIC_CIRCUIT_COOLDOWN_MS || 30_000);
            this.degradedUntil = Date.now() + coolDownMs;
            this.failureCount = 0;
            fabricCircuitOpen.set(1);
        }
    }

    markSuccess() {
        this.failureCount = 0;
        this.degradedUntil = 0;
        fabricCircuitOpen.set(0);
    }

    parseResult(result) {
        if (result === null || result === undefined) return result;
        const parseJson = (value) => {
            try {
                return JSON.parse(value);
            } catch {
                return value;
            }
        };
        if (Buffer.isBuffer(result)) {
            return parseJson(result.toString());
        }
        if (typeof result === 'string') {
            return parseJson(result);
        }
        if (typeof result === 'object') {
            return result;
        }
        return result;
    }

    getBreaker(actionName) {
        if (this.breakers.has(actionName)) {
            return this.breakers.get(actionName);
        }
        const timeout = Number(process.env.FABRIC_BREAKER_TIMEOUT_MS || 2500);
        const breaker = new CircuitBreaker(async (fn) => fn(), {
            timeout,
            errorThresholdPercentage: Number(process.env.FABRIC_BREAKER_ERROR_PCT || 50),
            resetTimeout: Number(process.env.FABRIC_BREAKER_RESET_MS || 15000),
            rollingCountTimeout: Number(process.env.FABRIC_BREAKER_WINDOW_MS || 10000),
            rollingCountBuckets: 10,
        });
        breaker.on('open', () => {
            fabricCircuitOpen.set(1);
            logger.warn('Fabric breaker opened', { actionName });
        });
        breaker.on('close', () => {
            fabricCircuitOpen.set(0);
            logger.info('Fabric breaker closed', { actionName });
        });
        this.breakers.set(actionName, breaker);
        return breaker;
    }

    async withCircuit(actionName, fn, options = {}) {
        const start = Date.now();
        const breaker = this.getBreaker(actionName);
        const staleKey = options.staleKey || null;
        try {
            const result = await breaker.fire(fn);
            const normalized = options.normalize ? this.parseResult(result) : result;
            this.markSuccess();
            fabricCallLatencyMs.labels(actionName, 'success').observe(Date.now() - start);
            if (staleKey && redisClient.isOpen) {
                await redisClient.set(staleKey, JSON.stringify(normalized), { EX: Number(process.env.FABRIC_STALE_TTL_SEC || 90) });
            }
            return normalized;
        } catch (error) {
            this.markFailure();
            fabricCallLatencyMs.labels(actionName, 'failure').observe(Date.now() - start);
            if (staleKey && redisClient.isOpen) {
                try {
                    const cached = await redisClient.get(staleKey);
                    if (cached) {
                        return JSON.parse(cached);
                    }
                } catch (cacheErr) {
                    logger.warn('Fabric stale cache read failed', { actionName, error: cacheErr.message });
                }
            }
            throw error;
        }
    }

    ensureAssets(ccpPath, walletPath) {
        if (!fs.existsSync(ccpPath)) {
            throw new Error(`Hyperledger Fabric connection profile missing at ${ccpPath}`);
        }
        if (!fs.existsSync(walletPath)) {
            throw new Error(`Fabric wallet directory not found at ${walletPath}. Run blockchain/scripts/startNetwork.sh first.`);
        }
    }

    /**
     * Initialize connection to Hyperledger Fabric network
     */
    async connect(userId = 'admin') {
        try {
            if (this.isCircuitOpen()) {
                throw new Error('Fabric circuit is open. Using fallback mode.');
            }
            // Load connection profile
            const ccpPath = path.resolve(__dirname, '../../..', 'blockchain', 'network', 'connection-profile.json');
            const walletPath = path.resolve(__dirname, '../../..', 'blockchain', 'wallet');
            this.ensureAssets(ccpPath, walletPath);
            const connectionProfile = JSON.parse(await fsPromises.readFile(ccpPath, 'utf8'));

            // Create wallet
            this.wallet = await Wallets.newFileSystemWallet(walletPath);

            // Check if user exists in wallet
            const identity = await this.wallet.get(userId);
            if (!identity) {
                throw new Error(`Identity ${userId} does not exist in wallet`);
            }

            // Create gateway connection
            this.gateway = new Gateway();
            await this.gateway.connect(connectionProfile, {
                wallet: this.wallet,
                identity: userId,
                discovery: { enabled: true, asLocalhost: true },
            });

            // Get network and contract
            this.network = await this.gateway.getNetwork(this.channelName);
            this.contract = this.network.getContract(this.chaincodeName);

            console.log('✅ Connected to Fabric network');
            this.markSuccess();
            return true;
        } catch (error) {
            console.error('❌ Failed to connect to Fabric:', error.message);
            this.markFailure();
            throw error;
        }
    }

    /**
     * Register a voter on the blockchain
     */
    async registerVoter(voterId, district, electionId) {
        try {
            const result = await this.withCircuit('register_voter', async () => {
                if (!this.contract) {
                    await this.connect();
                }
                return this.contract.submitTransaction(
                    'RegisterVoter',
                    voterId,
                    district,
                    electionId
                );
            });

            return this.parseResult(result);
        } catch (error) {
            console.error('Fabric - Register Voter Error:', error.message);
            this.markFailure();
            throw new Error(`Failed to register voter: ${error.message}`);
        }
    }

    /**
     * Cast a vote on the blockchain
     */
    async castVote(voterId, electionId, candidateId, district, verificationHash, terminalId) {
        try {
            const result = await this.withCircuit('cast_vote', async () => {
                if (!this.contract) {
                    await this.connect();
                }
                return this.contract.submitTransaction(
                    'CastVote',
                    voterId,
                    electionId,
                    candidateId,
                    district,
                    verificationHash,
                    terminalId
                );
            });

            return result.toString(); // Returns vote ID
        } catch (error) {
            console.error('Fabric - Cast Vote Error:', error.message);
            this.markFailure();

            // Check for double-voting attempt
            if (error.message.includes('DOUBLE_VOTE_ATTEMPT')) {
                throw new Error('DOUBLE_VOTE_ATTEMPT: Voter has already voted in this election');
            }

            throw new Error(`Failed to cast vote: ${error.message}`);
        }
    }

    /**
     * Check voter status on the blockchain
     */
    async checkVoterStatus(voterId, electionId) {
        try {
            const staleKey = `fabric:status:${voterId}:${electionId}`;
            const result = await this.withCircuit('check_voter_status', async () => {
                if (!this.contract) {
                    await this.connect();
                }
                return this.contract.evaluateTransaction(
                    'CheckVoterStatus',
                    voterId,
                    electionId
                );
            }, { staleKey, normalize: true });

            return result;
        } catch (error) {
            console.error('Fabric - Check Voter Status Error:', error.message);
            this.markFailure();
            throw new Error(`Failed to check voter status: ${error.message}`);
        }
    }

    /**
     * Get election results from blockchain
     */
    async getResults(electionId) {
        try {
            const staleKey = `fabric:results:${electionId}`;
            const result = await this.withCircuit('get_results', async () => {
                if (!this.contract) {
                    await this.connect();
                }
                return this.contract.evaluateTransaction(
                    'GetResults',
                    electionId
                );
            }, { staleKey, normalize: true });

            return result;
        } catch (error) {
            console.error('Fabric - Get Results Error:', error.message);
            this.markFailure();
            throw new Error(`Failed to get results: ${error.message}`);
        }
    }

    /**
     * Get a specific vote by ID
     */
    async getVoteById(voteId) {
        try {
            const staleKey = `fabric:vote:${voteId}`;
            const result = await this.withCircuit('get_vote_by_id', async () => {
                if (!this.contract) {
                    await this.connect();
                }
                return this.contract.evaluateTransaction(
                    'GetVoteByID',
                    voteId
                );
            }, { staleKey, normalize: true });

            return result;
        } catch (error) {
            console.error('Fabric - Get Vote Error:', error.message);
            this.markFailure();
            throw new Error(`Failed to get vote: ${error.message}`);
        }
    }

    async submitVote(votePayload = {}) {
        const {
            voterId,
            electionId,
            candidateId,
            districtId,
            district,
            verificationHash,
            terminalId,
        } = votePayload;

        return this.castVote(
            voterId,
            electionId,
            candidateId,
            districtId || district,
            verificationHash,
            terminalId
        );
    }

    async getVoteDetails(voteId) {
        return this.getVoteById(voteId);
    }

    async getVotesByElection(electionId) {
        try {
            const staleKey = `fabric:votes_by_election:${electionId}`;
            const payload = await this.withCircuit('get_votes_by_election', async () => {
                if (!this.contract) await this.connect();
                return this.contract.evaluateTransaction('GetVotesByElection', electionId);
            }, { staleKey, normalize: true });
            return payload;
        } catch (error) {
            console.warn('Fabric - getVotesByElection not available:', error.message);
            return [];
        }
    }

    /**
     * Get merkle proof for a vote / tx hash, if chaincode supports it.
     */
    async getMerkleProof(voteOrTxId) {
        try {
            const staleKey = `fabric:merkle:${voteOrTxId}`;
            const payload = await this.withCircuit('get_merkle_proof', async () => {
                if (!this.contract) await this.connect();
                return this.contract.evaluateTransaction('GetMerkleProof', voteOrTxId);
            }, { staleKey, normalize: true });
            return payload;
        } catch (error) {
            console.warn('Fabric - GetMerkleProof not available:', error.message);
            return null;
        }
    }

    /**
     * Create a new election on blockchain
     */
    async createElection(electionId, name, startDate, endDate, createdBy) {
        try {
            await this.withCircuit('create_election', async () => {
                if (!this.contract) {
                    await this.connect();
                }
                return this.contract.submitTransaction(
                    'CreateElection',
                    electionId,
                    name,
                    startDate,
                    endDate,
                    createdBy
                );
            });

            return { success: true, electionId };
        } catch (error) {
            console.error('Fabric - Create Election Error:', error.message);
            throw new Error(`Failed to create election: ${error.message}`);
        }
    }

    /**
     * Register a candidate on blockchain
     */
    async registerCandidate(candidateId, electionId, name, party, district) {
        try {
            await this.withCircuit('register_candidate', async () => {
                if (!this.contract) {
                    await this.connect();
                }
                return this.contract.submitTransaction(
                    'RegisterCandidate',
                    candidateId,
                    electionId,
                    name,
                    party,
                    district
                );
            });

            return { success: true, candidateId };
        } catch (error) {
            console.error('Fabric - Register Candidate Error:', error.message);
            throw new Error(`Failed to register candidate: ${error.message}`);
        }
    }

    /**
     * Get election results filtered by district
     */
    async getResultsByDistrict(electionId, districtId) {
        try {
            const staleKey = `fabric:results_district:${electionId}:${districtId}`;
            const result = await this.withCircuit('get_results_by_district', async () => {
                if (!this.contract) await this.connect();
                return this.contract.evaluateTransaction(
                    'GetResultsByDistrict', electionId, districtId
                );
            }, { staleKey, normalize: true });
            return result;
        } catch (error) {
            console.warn('Fabric - GetResultsByDistrict not available:', error.message);
            return []; // Graceful fallback
        }
    }

    /**
     * Disconnect from Fabric network
     */
    async disconnect() {
        if (this.gateway) {
            await this.gateway.disconnect();
            console.log('✅ Disconnected from Fabric network');
        }
    }
}

// Create singleton instance
const fabricService = new FabricService();

module.exports = fabricService;
