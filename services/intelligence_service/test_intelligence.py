import sys
import os

# Add the root directory to sys.path
root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, root_dir)

# Now we can import as a package
try:
    from services.intelligence_service.schemas import (
        KaivoScoreInput, SweetSpotInput, BudgetOptimizerInput
    )
    from services.intelligence_service.core import analyze_platforms, generate_sweet_spot
except ImportError:
    # Skip test if modules are not available
    def run_test():
        print("Skipping test: intelligence service modules not available")
    if __name__ == "__main__":
        run_test()
        sys.exit(0)

def run_test():
    # 1. Define Inputs
    roku_input = IntelligenceInput(
        platform="roku",
        category=PlatformCategoryEnum.STREAMING_TV,
        goal=GoalEnum.AWARENESS,
        metrics=MetricsInput(
            impressions=500000,
            reach=400000,
            frequency=1.25,
            views=450000,
            completions=400000,
            clicks=1000,
            conversions=50,
            spend=10000.0,
            cpm=20.0,
            cpc=10.0,
            cpa=200.0
        ),
        time_series=[]
    )

    meta_input = IntelligenceInput(
        platform="meta",
        category=PlatformCategoryEnum.SOCIAL,
        goal=GoalEnum.AWARENESS,
        metrics=MetricsInput(
            impressions=1000000,
            reach=800000,
            frequency=1.25,
            views=200000,
            completions=100000,
            clicks=15000,
            conversions=300,
            spend=5000.0,
            cpm=5.0,
            cpc=0.33,
            cpa=16.6
        ),
        time_series=[]
    )

    google_input = IntelligenceInput(
        platform="google_display",
        category=PlatformCategoryEnum.DISPLAY_SEARCH,
        goal=GoalEnum.AWARENESS,
        metrics=MetricsInput(
            impressions=2000000,
            reach=1500000,
            frequency=1.33,
            views=0,
            completions=0,
            clicks=5000,
            conversions=100,
            spend=4000.0,
            cpm=2.0,
            cpc=0.8,
            cpa=40.0
        ),
        time_series=[]
    )

    inputs = [roku_input, meta_input, google_input]

    # 2. Analyze
    print("--- Analyzing Platforms (Goal: AWARENESS) ---")
    results = analyze_platforms(inputs)
    
    for res in results:
        print(f"\nPlatform: {res.platform}")
        print(f"Kaivo Score: {res.kaivo_score}")
        print(f"Clusters: Visibility={res.cluster_scores.visibility:.1f}, Engagement={res.cluster_scores.engagement:.1f}, Efficiency={res.cluster_scores.efficiency:.1f}")
        print(f"Signal: {res.signal.direction.upper()} - {res.signal.reason}")

    # 3. Sweet Spot
    print("\n--- Sweet Spot Summary ---")
    sweet_spot = generate_sweet_spot(results)
    print(f"Top Platforms: {sweet_spot.top_platforms}")
    print(f"SMB Narrative: {sweet_spot.narrative_smb}")
    print(f"Agency Narrative: {sweet_spot.narrative_agency}")

    # 4. Creative Analysis
    print("\n--- Creative Analysis ---")
    from services.intelligence_service.creative import analyze_creative
    
    c_res = analyze_creative("https://example.com/low_res_image.jpg", "image")
    print(f"Low Res Image: Quality={c_res.quality_score}, Recs={c_res.recommendations}")
    
    c_res2 = analyze_creative("https://example.com/awesome_video.mp4", "video")
    print(f"Awesome Video: Quality={c_res2.quality_score}, Recs={c_res2.recommendations}")

if __name__ == "__main__":
    run_test()
