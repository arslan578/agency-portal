# Re-export User model from shared models to avoid duplication
from packages.db.models import User

__all__ = ['User']
