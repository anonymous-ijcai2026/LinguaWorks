#!/usr/bin/env python3
"""
Database API service startup script
Startup port: 5001
"""

import os
import sys
import subprocess


def main():
    """Start the database API service"""
    print("=" * 50)
    print("🚀 Start the database API service")
    print("=" * 50)

    # Make sure it is in the project root directory
    project_root = os.path.dirname(os.path.abspath(__file__))
    os.chdir(project_root)

    # Check the Python environment
    print(f"Python version: {sys.version}")
    print(f"working directory: {os.getcwd()}")

    # Start the database API service
    try:
        print("\n📡 Start the database API service (port: 5001)...")

        # Start using the "-m" method, and make sure the module path is correct.
        cmd = [sys.executable, "-m", "src.api.database_api"]

        print(f"Execute the command: {' '.join(cmd)}")
        print("\n" + "="*50)
        print("Database API Service Log:")
        print("="*50)

        # Run directly without using subprocess. This way, you can observe the real-time output.
        subprocess.run(cmd, check=True)

    except KeyboardInterrupt:
        print("\n\n⏹️  Received the stop signal and are currently shutting down the database API service....")
    except Exception as e:
        print(f"\n❌ Failed to start the database API service: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
