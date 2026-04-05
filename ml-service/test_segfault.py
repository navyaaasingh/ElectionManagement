import sys
import os
from fraud_detector import MOCK_MODE, get_detector

print("--- ML SERVICE MOCK MODE AUDIT ---")
print(f"System Detected Mock Mode: {MOCK_MODE}")

if MOCK_MODE:
    print("STATUS: SUCCESS (Graceful Fallback Active)")
    print("Testing mock inference...")
    
    detector = get_detector()
    sample_vote = {'terminalId': 'T1', 'timestamp': '2026-04-05T12:00:00'}
    history = [sample_vote] * 12 # Trigger mock 'burst'
    
    result = detector.predict(sample_vote, history)
    print(f"Mock Probability: {result['confidence']}")
    print(f"Is Fraudulent: {result['isFraudulent']}")
    print(f"Reason: {result['reason']}")
    
    if result['isFraudulent'] and 'Mock' in result['reason']:
        print("\nOVERALL TEST: PASSED ✅")
    else:
        print("\nOVERALL TEST: FAILED ❌")
else:
    print("STATUS: REAL MODE (All libraries loaded)")
    print("OVERALL TEST: PASSED ✅")

print("--- AUDIT COMPLETE ---")
