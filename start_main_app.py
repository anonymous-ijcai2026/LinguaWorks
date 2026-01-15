#!/usr/bin/env python3
"""
Main application service startup script
Startup port: 8000
"""

import os
import sys


def main():
    """Start the main application service"""
    print("=" * 50)
    print("🚀 Start the main application service")
    print("=" * 50)

    # Make sure it is in the project root directory
    project_root = os.path.dirname(os.path.abspath(__file__))
    os.chdir(project_root)

    # Check the Python environment
    print(f"Python version: {sys.version}")
    print(f"working directory: {os.getcwd()}")

    # Start the main application service
    try:
        print("\n🌐 Start the main application service (port: 8000)...")
        print("\n" + "="*50)
        print("Main application service log:")
        print("="*50)

        # Add the "src" directory to the Python path
        sys.path.insert(0, os.path.join(os.getcwd(), "src"))
        import uvicorn

        print("🚀 Starting the main application service务...")
        print("📝 Note: This only starts the main application. The database API needs to be started separately.")
        print("=" * 50)

        # Configure the uvicorn parameters
        uvicorn.run(
            "api.app:app",
            host="0.0.0.0",
            port=8000,
            reload=False,
            access_log=False,  # Reduce log output
            log_level="info",
        )

    except KeyboardInterrupt:
        print("\n\n⏹️  Received the stop signal. The main application service is being shut down....")
    except Exception as e:
        print(f"\n❌ Failed to start the main application service: {e}")
        sys.exit(1)
if __name__ == "__main__":
    main()
