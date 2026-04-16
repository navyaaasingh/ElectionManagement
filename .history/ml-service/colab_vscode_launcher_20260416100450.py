"""
Single-file launcher for running the ML API in Colab or VS Code notebooks.

What it does:
1) Ensures lightweight runtime dependencies are installed.
2) Imports logic from fraud_detector.py and api.py.
3) Starts the Flask API server.

Usage in Colab/Notebook cell:
!python colab_vscode_launcher.py

Usage in terminal:
python colab_vscode_launcher.py
"""

import importlib.util
import os
import subprocess
import sys
from typing import Dict


REQUIRED_PACKAGES: Dict[str, str] = {
    "flask": "flask",
    "flask_cors": "flask-cors",
    "requests": "requests",
    "pydantic": "pydantic",
}


def ensure_required_packages() -> None:
    """Install only missing packages requested for Colab runtime."""
    missing = []
    for module_name, package_name in REQUIRED_PACKAGES.items():
        if importlib.util.find_spec(module_name) is None:
            missing.append(package_name)

    if not missing:
        print("All required runtime packages are already installed.")
        return

    print(f"Installing missing packages: {', '.join(missing)}")
    subprocess.check_call([sys.executable, "-m", "pip", "install", *missing])


def main() -> None:
    ensure_required_packages()

    # Keep API aligned with local project defaults.
    os.environ.setdefault("ML_SERVICE_PORT", "5001")

    # Import after dependency check so notebook kernels don't fail early.
    from fraud_detector import MOCK_MODE, get_detector
    from api import app

    # Warm up detector once so startup mode is visible immediately.
    get_detector()

    port = int(os.environ.get("ML_SERVICE_PORT", "5001"))
    mode = "MOCK" if MOCK_MODE else "REAL"

    print("\nML API launcher ready")
    print(f"Mode: {mode}")
    print(f"Listening on: http://0.0.0.0:{port}")
    print(f"Health endpoint: http://0.0.0.0:{port}/health\n")

    app.run(host="0.0.0.0", port=port, debug=False, use_reloader=False)


if __name__ == "__main__":
    main()
