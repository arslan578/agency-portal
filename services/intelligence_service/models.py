from sqlalchemy import Column, Integer, String, JSON, ForeignKey
from packages.db.database import Base

class IntelligenceScore(Base):
    __tablename__ = "intelligence_scores"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    entity_type = Column(String) # 'platform', 'creative'
    entity_id = Column(String)
    scores_json = Column(JSON) # {visibility: 80, engagement: 90...}
    recommendations_json = Column(JSON)
