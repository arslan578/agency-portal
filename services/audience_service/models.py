# Re-export Audience model from shared models to avoid duplication
from packages.db.models import Audience

__all__ = ['Audience']
