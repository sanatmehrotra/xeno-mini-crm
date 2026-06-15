"""
Generate an ADMIN_PASSWORD_HASH from a plaintext password.

Usage:
    python scripts/hash_password.py yourpassword

Copy the output into crm-backend/.env as ADMIN_PASSWORD_HASH=<hash>
"""

import sys
from app.core.security import hash_password

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python scripts/hash_password.py <password>")
        sys.exit(1)
    plain = sys.argv[1]
    hashed = hash_password(plain)
    print(hashed)
