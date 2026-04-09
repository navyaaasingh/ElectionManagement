const { Candidate, VotingRecord } = require('../models/index.js');

const normalizeCandidateId = (value) => String(value || '').trim();

class RunoffService {
    async calculateRunoff(election, options = {}) {
        const runoffConfig = election?.runoff_config || {};
        const mode = String(runoffConfig.mode || options.mode || 'single_round').toLowerCase();

        if (mode !== 'multi_round_elimination') {
            return { mode: 'single_round', rounds: [], winner: null, eliminated: [] };
        }

        const candidates = await Candidate.findAll({
            where: { election_id: election.election_id, status: 'active' },
        });

        const activeCandidateIds = candidates.map((c) => normalizeCandidateId(c.candidate_id));
        if (activeCandidateIds.length === 0) {
            return { mode, rounds: [], winner: null, eliminated: [] };
        }

        const votingRecords = await VotingRecord.findAll({
            where: { election_id: election.election_id },
            order: [['vote_timestamp', 'ASC']],
        });

        const ballots = votingRecords.map((record) => {
            const ranked = Array.isArray(record.ranking_payload) && record.ranking_payload.length > 0
                ? record.ranking_payload
                : [record.blockchain_tx_id];

            return ranked.map((item) => normalizeCandidateId(item));
        });

        const thresholdPct = Number(runoffConfig.majorityThresholdPct || 50);
        const maxRounds = Number(runoffConfig.maxRounds || 10);
        const rounds = [];
        const eliminated = [];
        let active = [...activeCandidateIds];
        let winner = null;

        for (let roundNumber = 1; roundNumber <= maxRounds && active.length > 1; roundNumber += 1) {
            const counts = this.countRoundVotes(ballots, active);
            const totalCounted = Object.values(counts).reduce((sum, val) => sum + val, 0);

            const sorted = [...active]
                .map((id) => ({ candidateId: id, votes: counts[id] || 0 }))
                .sort((a, b) => b.votes - a.votes);

            const leader = sorted[0] || null;
            const leaderPct = totalCounted > 0 ? (leader.votes / totalCounted) * 100 : 0;

            rounds.push({
                round: roundNumber,
                counts,
                totalCounted,
                leader: leader || null,
                leaderPct: Number(leaderPct.toFixed(4)),
                eliminated: null,
            });

            if (leader && leaderPct > thresholdPct) {
                winner = leader;
                break;
            }

            const minVotes = sorted[sorted.length - 1]?.votes ?? 0;
            const eliminationPool = sorted.filter((entry) => entry.votes === minVotes);
            const eliminatedEntry = eliminationPool.sort((a, b) => a.candidateId.localeCompare(b.candidateId))[0];

            if (!eliminatedEntry) {
                break;
            }

            active = active.filter((id) => id !== eliminatedEntry.candidateId);
            eliminated.push(eliminatedEntry.candidateId);
            rounds[rounds.length - 1].eliminated = eliminatedEntry.candidateId;
        }

        if (!winner && active.length === 1) {
            const finalCounts = this.countRoundVotes(ballots, active);
            winner = { candidateId: active[0], votes: finalCounts[active[0]] || 0 };
        }

        return {
            mode,
            rounds,
            winner,
            eliminated,
            config: {
                thresholdPct,
                maxRounds,
            },
        };
    }

    countRoundVotes(ballots, activeCandidates) {
        const activeSet = new Set(activeCandidates);
        const counts = Object.fromEntries(activeCandidates.map((id) => [id, 0]));

        for (const ballot of ballots) {
            const choice = ballot.find((candidateId) => activeSet.has(candidateId));
            if (choice) {
                counts[choice] += 1;
            }
        }

        return counts;
    }
}

module.exports = new RunoffService();