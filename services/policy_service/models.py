from sqlalchemy import Column, Integer, String, Boolean, ForeignKey
from packages.db.database import Base

class PolicyRule(Base):
    __tablename__ = "policy_rules"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    platform = Column(String)
    rule_type = Column(String) # 'text_ratio', 'duration'
    value = Column(String)
    is_active = Column(Boolean, default=True)
