from packages.shared.constants import KAIVO_CPM_MARKUP

def calculate_effective_cpm(raw_cpm: float) -> float:
    """
    Apply Kaivo's global markup to a raw CPM value.
    
    Args:
        raw_cpm: The raw CPM from the platform/adapter.
        
    Returns:
        The effective CPM to be shown to the user and used for scoring.
    """
    return raw_cpm * KAIVO_CPM_MARKUP
