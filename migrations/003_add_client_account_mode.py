"""
Migration 003: Add account_mode column to clients table.

Distinguishes between:
  - 'kaivo_managed': Runs ads through Kaivo -> must purchase ad credits
  - 'reporting_only': Uses own platform accounts -> only pays monthly platform fee
"""

UP = """
ALTER TABLE clients ADD COLUMN IF NOT EXISTS account_mode VARCHAR(20) DEFAULT 'kaivo_managed';
"""

DOWN = """
ALTER TABLE clients DROP COLUMN IF EXISTS account_mode;
"""
