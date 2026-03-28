from sqlalchemy import Column, Integer, String, DECIMAL, Date, ForeignKey
from packages.db.database import Base

class DailyMetric(Base):
    __tablename__ = "daily_metrics"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, index=True)
    platform = Column(String)
    date = Column(Date)
    impressions = Column(Integer, default=0)
    clicks = Column(Integer, default=0)
    spend = Column(DECIMAL(10, 2), default=0.00)
    conversions = Column(Integer, default=0)
