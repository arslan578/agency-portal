import sys
import os

# Add the root directory to sys.path
root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, root_dir)

# Import via importlib due to hyphen
import importlib.util
guard_path = os.path.join(root_dir, "services", "policy_service", "guard.py")
if not os.path.exists(guard_path):
    # Skip test if guard.py doesn't exist
    def run_test():
        print("Skipping test: policy guard module not available")
    if __name__ == "__main__":
        run_test()
        sys.exit(0)
else:
    spec = importlib.util.spec_from_file_location("guard", guard_path)
    guard = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(guard)

def run_test():
    print("--- Testing Policy Guard ---")
    
    # 1. Meta Text Ratio Violation
    res1 = guard.check_policy("meta", "image", {"text_ratio": 0.25})
    print(f"\nMeta Image (Text Ratio 0.25): Passed={res1.passed}, Warnings={res1.warnings}")
    
    # 2. TikTok Duration Violation
    res2 = guard.check_policy("tiktok", "video", {"duration": 70})
    print(f"TikTok Video (Duration 70s): Passed={res2.passed}, Violations={res2.violations}")
    
    # 3. Political Content
    res3 = guard.check_policy("google", "video", {"is_political": True})
    print(f"Google Video (Political): Passed={res3.passed}, Violations={res3.violations}")

if __name__ == "__main__":
    run_test()
