#!/usr/bin/env python3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from agent import run

if __name__ == "__main__":
    config = sys.argv[1] if len(sys.argv) > 1 else "~/.jarvis/sync-agent.yaml"
    sys.exit(run(config))
