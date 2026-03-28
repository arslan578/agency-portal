from sqlalchemy import Column, Integer, String, DECIMAL, DateTime, ForeignKey
from datetime import datetime
from packages.db.database import Base

class CreditTransaction(Base):
    """
    Log all credit movements (purchases, subscriptions, campaign spend).
    Credits are tracked at the Agency level.
    """
    __tablename__ = "credit_transactions"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    agency_id = Column(Integer, ForeignKey("agencies.id"), index=True, nullable=False)
    amount = Column(DECIMAL(10, 2))  # Positive = added, Negative = spent
    transaction_type = Column(String(50))  # 'purchase', 'campaign_spend', 'subscription_payment', 'refund'
    description = Column(String(255))
    stripe_payment_id = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
