
import os
import sys
from sqlalchemy import create_engine, text

# Add the project root to sys.path so we can import packages
sys.path.append(os.getcwd())

from packages.db.database import DATABASE_URL

def up():
    engine = create_engine(DATABASE_URL)
    
    create_table_sql = """
    CREATE TABLE IF NOT EXISTS ai_insights (
        id VARCHAR PRIMARY KEY,
        agency_id INTEGER NOT NULL REFERENCES agencies(id),
        client_id INTEGER NOT NULL REFERENCES clients(id),
        platform VARCHAR,
        platform_label VARCHAR,
        severity VARCHAR NOT NULL,
        categories JSON,
        title VARCHAR(120) NOT NULL,
        description VARCHAR(400),
        impact_metrics JSON,
        apply_label VARCHAR,
        review_label VARCHAR,
        review_url VARCHAR,
        icon VARCHAR,
        accent_color VARCHAR,
        icon_bg VARCHAR,
        status VARCHAR DEFAULT 'pending',
        action_taken TEXT,
        priority_score FLOAT DEFAULT 0.5,
        recoverable_spend_cents INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS ix_ai_insights_id ON ai_insights (id);
    CREATE INDEX IF NOT EXISTS ix_ai_insights_client_id ON ai_insights (client_id);
    """
    
    print("Creating ai_insights table using raw SQL...")
    with engine.connect() as conn:
        conn.execute(text(create_table_sql))
        conn.commit()
    print("Table created successfully.")

if __name__ == "__main__":
    up()
