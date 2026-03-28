#!/bin/bash
# Apply migration to production database
# Usage: ./apply_prod_migration.sh

DB_HOST="dpg-d4gnbkp5pdvs738nd03g-a.oregon-postgres.render.com"
DB_PORT="5432"
DB_NAME="kaivocore_db"
DB_USER="kaivocore_db_user"
DB_PASSWORD="j1wyfFtFv8EubKozAv5q3CTl6vvEWI7y"

echo "Applying migration to production database..."
echo "Host: $DB_HOST"
echo "Database: $DB_NAME"

PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f migrations/add_media_columns_prod.sql

echo "Migration completed!"
