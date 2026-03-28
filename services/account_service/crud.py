"""
Account Service CRUD Operations

DEPRECATED: Legacy Account/Brand/License operations.
Use Agency/Client operations from routers/agency.py instead.

This file is kept for backward compatibility but will be removed in a future release.
"""

from sqlalchemy.orm import Session
from . import models


def get_account(db: Session, account_id: int):
    """DEPRECATED: Use Agency instead"""
    return db.query(models.Account).filter(models.Account.id == account_id).first()
