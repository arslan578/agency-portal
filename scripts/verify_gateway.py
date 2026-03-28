import sys
import os
from pathlib import Path

# Add project root to sys.path
project_root = Path(__file__).parent.parent
sys.path.append(str(project_root))

try:
    from services.api_gateway.main import app
    print("✅ Successfully imported API Gateway app.")
    
    print("\n--- Registered Routes ---")
    routes = []
    for route in app.routes:
        if hasattr(route, "path"):
            routes.append(f"{route.methods} {route.path}")
    
    # Sort and print
    for r in sorted(routes):
        print(r)
        
    # Verify specific key routes exist
    expected_prefixes = [
        "/auth", "/accounts", "/agent", "/audiences", 
        "/billing", "/plans", "/assets", "/intelligence", 
        "/policy", "/reports"
    ]
    
    missing = []
    for prefix in expected_prefixes:
        found = any(prefix in r for r in routes)
        if not found:
            missing.append(prefix)
            
    if not missing:
        print("\n✅ All expected service prefixes found in routes.")
    else:
        print(f"\n❌ Missing service prefixes: {missing}")

except ImportError as e:
    print(f"❌ Failed to import API Gateway: {e}")
except Exception as e:
    print(f"❌ Unexpected error: {e}")
