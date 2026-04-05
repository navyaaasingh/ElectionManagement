# %%
"""
Flask API for ML Fraud Detection Service
"""

# %%
# !pip install Flask flask-cors scikit-learn joblib kafka-python
from flask import Flask, request, jsonify
from flask_cors import CORS
import logging
from fraud_detector import analyze_vote, get_detector, MOCK_MODE
import os


# %%
# Initialize Flask app
app = Flask(__name__)
CORS(app)

# %%
# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# %%
@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy' if not MOCK_MODE else 'degraded',
        'mode': 'MOCK' if MOCK_MODE else 'REAL',
        'service': 'ml-fraud-detection',
        'version': '1.0.0',
    })


# %%
@app.route('/api/ml/analyze', methods=['POST'])
def analyze():
    """
    Analyze a vote for potential fraud
    
    Request body:
    {
        "vote": {
            "voterId": "...",
            "candidateId": "...",
            "terminalId": "...",
            "districtId": "...",
            "timestamp": "..."
        },
        "history": [ ... ]  // Recent votes
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'vote' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing vote data',
            }), 400
        
        vote_data = data['vote']
        historical_data = data.get('history', [])
        
        # Analyze vote
        result = analyze_vote(vote_data, historical_data)
        
        return jsonify({
            'success': True,
            'analysis': result,
        })
        
    except Exception as e:
        logger.error(f"Error analyzing vote: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
        }), 500


# %%
@app.route('/api/ml/train', methods=['POST'])
def train_model():
    """
    Train the fraud detection model
    
    Request body:
    {
        "votes": [ ... ]  // Historical votes
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'votes' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing training data',
            }), 400
        
        votes = data['votes']
        
        if len(votes) < 100:
            return jsonify({
                'success': False,
                'error': 'Insufficient training data (minimum 100 votes required)',
            }), 400
        
        # Get detector and train
        detector = get_detector()
        detector.train(votes)
        
        # Save model
        model_path = os.getenv('FRAUD_MODEL_PATH', 'models/fraud_detector.joblib')
        os.makedirs(os.path.dirname(model_path), exist_ok=True)
        detector.save_model(model_path)
        
        return jsonify({
            'success': True,
            'message': f'Model trained on {len(votes)} votes',
            'modelPath': model_path,
        })
        
    except Exception as e:
        logger.error(f"Error training model: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
        }), 500


# %%
@app.route('/api/ml/batch-analyze', methods=['POST'])
def batch_analyze():
    """
    Analyze multiple votes in batch
    
    Request body:
    {
        "votes": [ ... ],
        "history": [ ... ]
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'votes' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing votes data',
            }), 400
        
        votes = data['votes']
        historical_data = data.get('history', [])
        
        # Analyze each vote
        results = []
        for vote in votes:
            result = analyze_vote(vote, historical_data)
            results.append({
                'voteId': vote.get('voteId'),
                'analysis': result,
            })
        
        # Summary statistics
        total = len(results)
        fraudulent = sum(1 for r in results if r['analysis']['isFraudulent'])
        
        return jsonify({
            'success': True,
            'results': results,
            'summary': {
                'total': total,
                'fraudulent': fraudulent,
                'normal': total - fraudulent,
                'fraudRate': fraudulent / total if total > 0 else 0,
            },
        })
        
    except Exception as e:
        logger.error(f"Error in batch analysis: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
        }), 500


# %%
    port = int(os.getenv('ML_SERVICE_PORT', 5000))
    if MOCK_MODE:
        logger.warning("!!! ML SERVICE STARTING IN MOCK MODE !!!")
        logger.warning("Heuristic fallback will be used for fraud detection.")
    else:
        logger.info("ML Service starting in REAL mode (Ensemble loaded).")
    app.run(host='0.0.0.0', port=port, debug=False)
