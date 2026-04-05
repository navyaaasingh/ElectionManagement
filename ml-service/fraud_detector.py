# %%
"""
ML Fraud Detection Service
Analyzes voting patterns and detects anomalies in real-time,
utilizing an ensemble of Isolation Forest, XGBoost, and LSTM models.
"""

# %%
import os
import json
import logging
from datetime import datetime
from typing import Dict, List, Optional

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Mock Mode detection
MOCK_MODE = False

try:
    import numpy as np
    from sklearn.ensemble import IsolationForest
    from sklearn.preprocessing import StandardScaler
    import joblib
    import xgboost as xgb
    # Suppress noisy TF logs
    os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'
    from tensorflow.keras.models import Sequential, load_model
    from tensorflow.keras.layers import LSTM, Dense, Input
except (ImportError, RuntimeError, Exception) as e:
    MOCK_MODE = True
    # Provide dummy types for type hinting if needed
    np = None
    StandardScaler = lambda: None
    logger.warning(f"ML libraries missing or failed to load ({e}). Entering MOCK_MODE.")


# %%
class FraudDetector:
    """
    Fraud detection engine using an Ensemble algorithm:
    1. Isolation Forest (Unsupervised scale anomalies) (40% weight)
    2. XGBoost (Supervised Tabular classification) (40% weight)
    3. LSTM (Sequence forecasting) (20% weight)
    """
    
    def __init__(self, model_dir: str = 'models'):
        self.model_dir = model_dir
        self.scaler = StandardScaler()
        
        # Isolation Forest
        self.iso_model = None
        
        # XGBoost Classifier
        self.xgb_model = None
        
        # LSTM Model
        self.lstm_model = None
        
        self.is_initialized = False

        # Attempt load from disk if passed a directory
        self.load_models()

        # If not fully loaded, init with placeholders
        if not self.is_initialized and not MOCK_MODE:
            self._initialize_placeholders()
        elif MOCK_MODE:
            self.is_initialized = True
            logger.info("FraudDetector initialized in MOCK_MODE (Heuristic fallback).")

    def _initialize_placeholders(self):
        """Build models with random/placeholder weights until actual data is trained"""
        logger.info("Initializing fallback placeholder models for ensemble...")
        
        self.iso_model = IsolationForest(
            contamination=0.01,
            random_state=42,
            n_estimators=100,
        )

        self.xgb_model = xgb.XGBClassifier(
            n_estimators=100,
            max_depth=6,
            learning_rate=0.1,
            random_state=42,
            use_label_encoder=False,
            eval_metric="auc"
        )
        
        # Keras LSTM expecting (timesteps=5, features=6)
        self.lstm_model = Sequential([
            Input(shape=(5, 6)),
            LSTM(32, activation='relu'),
            Dense(16, activation='relu'),
            Dense(1, activation='sigmoid') # Forecasts probability of sequence anomaly
        ])
        self.lstm_model.compile(optimizer='adam', loss='binary_crossentropy')
        
        self.is_initialized = True
        logger.info("Ensemble initialized with default parameters.")

    def extract_features(self, vote_data: Dict, historical_data: List[Dict]):
        """Extract flat 1D feature array (length 6) for Isolation Forest and XGBoost."""
        if MOCK_MODE:
            return [0] * 6 # Dummy list for mock mode logic

        features = []
        
        vote_time = datetime.fromisoformat(vote_data.get('timestamp', datetime.now().isoformat()))
        features.append(vote_time.hour)
        features.append(vote_time.minute)
        
        terminal_id = vote_data.get('terminalId', '')
        terminal_history = [v for v in historical_data if v.get('terminalId') == terminal_id]
        
        # feature 3: lifetime terminal votes
        features.append(len(terminal_history))
        
        # feature 4: recent votes (last 5 min globablly)
        five_min_ago = vote_time.timestamp() - 300
        recent_votes = sum(
            1 for v in historical_data 
            if datetime.fromisoformat(v.get('timestamp', '2000-01-01')).timestamp() > five_min_ago
        )
        features.append(recent_votes)
        
        # feature 5: lifetime district votes
        district_id = vote_data.get('districtId', '')
        district_votes = sum(1 for v in historical_data if v.get('districtId') == district_id)
        features.append(district_votes)
        
        # feature 6: time since last vote on this terminal
        if terminal_history:
            last_vote_time = max(datetime.fromisoformat(v.get('timestamp', '2000-01-01')) for v in terminal_history)
            time_diff = (vote_time - last_vote_time).total_seconds()
        else:
            time_diff = 9999
        features.append(time_diff)
        
        return np.array(features).reshape(1, -1)
        
    def extract_sequence_features(self, vote_data: Dict, historical_data: List[Dict], sequence_length: int = 5):
        """Extract a 3D tensor sequence of shape (1, sequence_length, 6) for LSTM."""
        if MOCK_MODE:
            return [[0] * 6] * sequence_length

        # Find the last `sequence_length - 1` historical votes
        recent = sorted(historical_data, key=lambda x: x.get('timestamp', ''))[-(sequence_length-1):]
        # Append current vote
        sequence = recent + [vote_data]
        
        # If sequence is too short, pad it with the current vote
        while len(sequence) < sequence_length:
            sequence.insert(0, vote_data)
            
        feature_seq = []
        for i, v in enumerate(sequence):
            # Pass a sliced history up to the point of 'v'
            slice_history = sequence[:i]
            feat = self.extract_features(v, slice_history)[0]
            feature_seq.append(feat)
            
        # Shape: (1, timesteps, features)
        return np.array(feature_seq).reshape(1, sequence_length, 6)

    def train(self, historical_votes: List[Dict]):
        if len(historical_votes) < 100:
            logger.warning(f"Insufficient training data: {len(historical_votes)} votes")
            return
            
        logger.info(f"Training multi-model ensemble on {len(historical_votes)} historical votes")
        
        # Extract features for all votes
        X_flat = []
        y_pseudo = [] # Generate synthetic labels (5% fraud) for XGB and LSTM initialization
        X_seq = []
        
        # Sort chronologically
        history_sorted = sorted(historical_votes, key=lambda x: x.get('timestamp', ''))
        
        for i, vote in enumerate(history_sorted):
            history_slice = history_sorted[:i]
            flat_feat = self.extract_features(vote, history_slice)[0]
            seq_feat = self.extract_sequence_features(vote, history_slice)[0]
            
            X_flat.append(flat_feat)
            X_seq.append(seq_feat)
            
            # Create a simple pseudo label heuristic for baseline training
            # E.g. extremely rapid voting or huge volume
            if flat_feat[3] > 80 or flat_feat[5] < 1.0:
                y_pseudo.append(1)  # Fraud
            else:
                y_pseudo.append(0)  # Normal
                
        X_flat = np.array(X_flat)
        y_pseudo = np.array(y_pseudo)
        X_seq = np.array(X_seq)
        
        # 1. Fit scaler
        X_scaled = self.scaler.fit_transform(X_flat)
        
        # Scale 3D sequences
        samples, timesteps, features = X_seq.shape
        X_seq_scaled = self.scaler.transform(X_seq.reshape(-1, features)).reshape(samples, timesteps, features)
        
        # 2. Train Isolation Forest (unsupervised)
        self.iso_model.fit(X_scaled)
        
        # 3. Train XGBoost
        # If purely uniform labels exist, XGBoost will throw an error. Force at least one variance
        if sum(y_pseudo) == 0: y_pseudo[-1] = 1
        self.xgb_model.fit(X_scaled, y_pseudo)
        
        # 4. Train LSTM
        self.lstm_model.fit(X_seq_scaled, y_pseudo, epochs=5, batch_size=32, verbose=0)
        
        logger.info("Ensemble training complete")

    def predict(self, vote_data: Dict, historical_data: List[Dict]) -> Dict:
        if MOCK_MODE:
            # Simple heuristic detection for mock mode
            terminal_id = vote_data.get('terminalId', '')
            vote_time = datetime.fromisoformat(vote_data.get('timestamp', datetime.now().isoformat()))
            five_min_ago = vote_time.timestamp() - 300
            
            recent_on_terminal = [
                v for v in historical_data 
                if v.get('terminalId') == terminal_id and 
                datetime.fromisoformat(v.get('timestamp', '2000-01-01')).timestamp() > five_min_ago
            ]
            
            # Detect burst: more than 10 votes in 5 mins on one terminal
            is_fraudulent = len(recent_on_terminal) > 10
            confidence = 0.85 if is_fraudulent else 0.05
            
            result = {
                'isFraudulent': is_fraudulent,
                'confidence': confidence,
                'details': {
                    'isolationForestScore': 0.0,
                    'xgboostScore': 0.0,
                    'lstmScore': 0.0,
                    'isMock': True
                },
                'anomalyScore': float(confidence * 10),
                'reason': "Mock Detection: Terminal burst detected" if is_fraudulent else "Normal voting pattern",
                'timestamp': datetime.now().isoformat(),
            }
            if is_fraudulent:
                logger.warning(f"🚨 MOCK FRAUD DETECTED: {result}")
            return result

        # Extract features
        flat_feats = self.extract_features(vote_data, historical_data)
        seq_feats = self.extract_sequence_features(vote_data, historical_data)
        
        # Scale
        flat_scaled = self.scaler.transform(flat_feats)
        seq_scaled = self.scaler.transform(seq_feats.reshape(-1, 6)).reshape(1, 5, 6)
        
        reasons = []
        
        # 1. Isolation Forest Inference
        try:
            iso_score_raw = self.iso_model.score_samples(flat_scaled)[0]
            iso_conf = max(0, min(1, 1 - (iso_score_raw + 0.5)))
        except Exception:
            iso_conf = 0.0

        # 2. XGBoost Inference
        try:
            xgb_prob = self.xgb_model.predict_proba(flat_scaled)[0][1] # Probability of class 1
            xgb_conf = float(xgb_prob)
        except Exception as e:
            # If XGBoost is unfitted, gracefully fallback
            xgb_conf = 0.0

        # 3. LSTM Inference
        try:
            lstm_prob = self.lstm_model.predict(seq_scaled, verbose=0)[0][0]
            lstm_conf = float(lstm_prob)
        except Exception:
            lstm_conf = 0.0

        # Weighted Ensemble Voting (40% ISO, 40% XGB, 20% LSTM)
        ensemble_confidence = (0.4 * iso_conf) + (0.4 * xgb_conf) + (0.2 * lstm_conf)
        
        is_fraudulent = ensemble_confidence >= float(os.getenv('ANOMALY_THRESHOLD', '0.6'))
        
        # Collect reasoning logic
        if is_fraudulent:
            if iso_conf > 0.6: reasons.append("Isolation Forest detected distance anomaly")
            if xgb_conf > 0.6: reasons.append("XGBoost classified tabular heuristic match")
            if lstm_conf > 0.6: reasons.append("LSTM time-series forecasting detected sudden burst")
            
        final_reason = " | ".join(reasons) if reasons else "Normal voting pattern"

        result = {
            'isFraudulent': is_fraudulent,
            'confidence': ensemble_confidence,
            'details': {
                'isolationForestScore': iso_conf,
                'xgboostScore': xgb_conf,
                'lstmScore': lstm_conf
            },
            'anomalyScore': float(ensemble_confidence * 10),
            'reason': final_reason,
            'timestamp': datetime.now().isoformat(),
        }
        
        if is_fraudulent:
            logger.warning(f"🚨 ENSEMBLE FRAUD DETECTED: {result}")
            
        return result

    def save_models(self):
        os.makedirs(self.model_dir, exist_ok=True)
        try:
            # Save Base ML Models + Scaler
            base_path = os.path.join(self.model_dir, 'base_models.joblib')
            joblib.dump({
                'iso_model': self.iso_model,
                'xgb_model': self.xgb_model,
                'scaler': self.scaler
            }, base_path)
            
            # Save Keras LSTM
            lstm_path = os.path.join(self.model_dir, 'lstm_model.h5')
            if self.lstm_model is not None:
                self.lstm_model.save(lstm_path)
            logger.info("Ensemble models saved successfully.")
        except Exception as e:
            logger.error(f"Failed to save ensemble models: {e}")

    def load_models(self):
        base_path = os.path.join(self.model_dir, 'base_models.joblib')
        lstm_path = os.path.join(self.model_dir, 'lstm_model.h5')
        
        try:
            if os.path.exists(base_path):
                data = joblib.load(base_path)
                self.iso_model = data['iso_model']
                self.xgb_model = data['xgb_model']
                self.scaler = data['scaler']
            
            if os.path.exists(lstm_path):
                self.lstm_model = load_model(lstm_path)
                
            if self.iso_model and self.xgb_model and self.lstm_model:
                self.is_initialized = True
                logger.info("Ensemble models loaded successfully.")
        except Exception as e:
            logger.warning(f"No existing valid model ensemble found ({e}). Will re-init.")


# %%
# Singleton instance
_detector = None

# %%
def get_detector() -> FraudDetector:
    global _detector
    if _detector is None:
        model_directory = os.path.dirname(os.getenv('FRAUD_MODEL_PATH', 'src/models/voting_patterns.pkl'))
        _detector = FraudDetector(model_directory)
    return _detector

# %%
def analyze_vote(vote_data: Dict, historical_data: List[Dict]) -> Dict:
    detector = get_detector()
    return detector.predict(vote_data, historical_data)

# %%
if __name__ == '__main__':
    # Local simulation test
    logger.info("Fraud Detection Ensemble - Mock Inference Test")
    sample_vote = {
        'voterId': 'SYNTH_TEST1',
        'terminalId': 'TERM_1',
        'districtId': 'D1',
        'timestamp': datetime.now().isoformat()
    }
    history = [sample_vote for _ in range(50)] # Rapid successive identical votes
    
    det = FraudDetector()
    det.train(history + [sample_vote]) # Force a mini-train to fit weights
    res = det.predict(sample_vote, history)
    print("\nEnsemble Output:")
    print(json.dumps(res, indent=2))
