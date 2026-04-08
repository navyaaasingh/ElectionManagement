const { Gateway, Wallets } = require('fabric-network');
const fsPromises = require('fs/promises');
const fs = require('fs');
const path = require('path');


class FabricService {
    constructor() {
        this.gateway = null;
        this.wallet = null;
        this.network = null;
        this.contract = null;
        this.channelName = process.env.FABRIC_CHANNEL_NAME || 'election-channel';
        this.chaincodeName = process.env.FABRIC_CHAINCODE_NAME || 'voting';
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
            return true;
        } catch (error) {
            console.error('❌ Failed to connect to Fabric:', error.message);
            throw error;
        }
    }

    /**
     * Register a voter on the blockchain
     */
    async registerVoter(voterId, district, electionId) {
        try {
            if (!this.contract) {
                await this.connect();
            }

            const result = await this.contract.submitTransaction(
                'RegisterVoter',
                voterId,
                district,
                electionId
            );

            return JSON.parse(result.toString());
        } catch (error) {
            console.error('Fabric - Register Voter Error:', error.message);
            throw new Error(`Failed to register voter: ${error.message}`);
        }
    }

    /**
     * Cast a vote on the blockchain
     */
    async castVote(voterId, electionId, candidateId, district, verificationHash, terminalId) {
        try {
            if (!this.contract) {
                await this.connect();
            }

            const result = await this.contract.submitTransaction(
                'CastVote',
                voterId,
                electionId,
                candidateId,
                district,
                verificationHash,
                terminalId
            );

            return result.toString(); // Returns vote ID
        } catch (error) {
            console.error('Fabric - Cast Vote Error:', error.message);

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
            if (!this.contract) {
                await this.connect();
            }

            const result = await this.contract.evaluateTransaction(
                'CheckVoterStatus',
                voterId,
                electionId
            );

            return JSON.parse(result.toString());
        } catch (error) {
            console.error('Fabric - Check Voter Status Error:', error.message);
            throw new Error(`Failed to check voter status: ${error.message}`);
        }
    }

    /**
     * Get election results from blockchain
     */
    async getResults(electionId) {
        try {
            if (!this.contract) {
                await this.connect();
            }

            const result = await this.contract.evaluateTransaction(
                'GetResults',
                electionId
            );

            return JSON.parse(result.toString());
        } catch (error) {
            console.error('Fabric - Get Results Error:', error.message);
            throw new Error(`Failed to get results: ${error.message}`);
        }
    }

    /**
     * Get a specific vote by ID
     */
    async getVoteById(voteId) {
        try {
            if (!this.contract) {
                await this.connect();
            }

            const result = await this.contract.evaluateTransaction(
                'GetVoteByID',
                voteId
            );

            return JSON.parse(result.toString());
        } catch (error) {
            console.error('Fabric - Get Vote Error:', error.message);
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
            if (!this.contract) await this.connect();
            const payload = await this.contract.evaluateTransaction('GetVotesByElection', electionId);
            return JSON.parse(payload.toString());
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
            if (!this.contract) await this.connect();
            const payload = await this.contract.evaluateTransaction('GetMerkleProof', voteOrTxId);
            return JSON.parse(payload.toString());
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
            if (!this.contract) {
                await this.connect();
            }

            await this.contract.submitTransaction(
                'CreateElection',
                electionId,
                name,
                startDate,
                endDate,
                createdBy
            );

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
            if (!this.contract) {
                await this.connect();
            }

            await this.contract.submitTransaction(
                'RegisterCandidate',
                candidateId,
                electionId,
                name,
                party,
                district
            );

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
            if (!this.contract) await this.connect();
            const result = await this.contract.evaluateTransaction(
                'GetResultsByDistrict', electionId, districtId
            );
            return JSON.parse(result.toString());
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
