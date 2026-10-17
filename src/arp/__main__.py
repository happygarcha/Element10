"""Run: python -m arp  (binds to 127.0.0.1 only; this is a private tool)."""

import os

import uvicorn

if __name__ == "__main__":
    uvicorn.run("arp.web.app:create_app", factory=True, host=os.environ.get("ARP_HOST", "127.0.0.1"),
                port=int(os.environ.get("ARP_PORT", "8000")))
