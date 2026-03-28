#!/usr/bin/env python3
"""
Database Seed Script for Kaivo

This script seeds the database with realistic test data for development.
Usage: python scripts/seed_database.py [--reset] [--verify-only]
"""

import sys
import os
from datetime import datetime, timedelta
from decimal import Decimal
import json

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from sqlalchemy import text
from packages.db.database import SessionLocal, engine
from packages.db.models import (
    User, Agency, AgencyMembership, Client, ClientMembership, ClientUserPermission,
    Audience, PlatformAccount, Plan, Campaign, Invoice, UsageRecord,
    AgencyRole, ClientRole, CampaignStatus, PlanStatus, PlanTier, InvoiceStatus
)

def reset_tables(db: Session):
    """Truncate all tables in dependency order (reverse of creation order)"""
    print("Resetting all tables...")
    db.execute(text("TRUNCATE TABLE usage_records, invoices, campaigns, plans, platform_accounts, audiences, client_user_permissions, client_memberships, clients, agency_memberships, agencies, users RESTART IDENTITY CASCADE;"))
    db.commit()
    print("Tables reset complete.")

def seed_users(db: Session):
    """Seed Users table"""
    print("Seeding users...")
    
    users_data = [
        {
            "email": "admin@kaivo.com",
            "hashed_password": "admin123",  # Plain text for dev
            "full_name": "Admin User",
            "is_active": True,
            "is_superuser": True,
            "company_name": "Kaivo Inc"
        },
        {
            "email": "alice@agency.com",
            "hashed_password": "alice123",
            "full_name": "Alice Johnson",
            "is_active": True,
            "is_superuser": False,
            "company_name": "Digital Marketing Agency"
        },
        {
            "email": "bob@agency.com",
            "hashed_password": "bob123",
            "full_name": "Bob Smith",
            "is_active": True,
            "is_superuser": False,
            "company_name": "Digital Marketing Agency"
        },
        {
            "email": "carol@client.com",
            "hashed_password": "carol123",
            "full_name": "Carol Williams",
            "is_active": True,
            "is_superuser": False,
            "company_name": "Tech Startup Inc"
        }
    ]
    
    users = []
    for user_data in users_data:
        user = User(**user_data)
        db.add(user)
        users.append(user)
    
    db.commit()
    for user in users:
        db.refresh(user)
    
    print(f"  Created {len(users)} users")
    return users

def seed_agencies(db: Session):
    """Seed Agencies table"""
    print("Seeding agencies...")
    
    agencies_data = [
        {
            "name": "Digital Marketing Agency",
            "current_plan": PlanTier.GROWTH,
            "stripe_customer_id": "cus_dma_123"
        },
        {
            "name": "Small Agency",
            "current_plan": PlanTier.FREE,
            "stripe_customer_id": None
        }
    ]
    
    agencies = []
    for agency_data in agencies_data:
        agency = Agency(**agency_data)
        db.add(agency)
        agencies.append(agency)
    
    db.commit()
    for agency in agencies:
        db.refresh(agency)
    
    print(f"  Created {len(agencies)} agencies")
    return agencies

def seed_agency_memberships(db: Session, users: list, agencies: list):
    """Seed AgencyMemberships table"""
    print("Seeding agency memberships...")
    
    # Admin user is admin of first agency
    # Alice and Bob are members of first agency
    memberships = [
        AgencyMembership(user_id=users[0].id, agency_id=agencies[0].id, role=AgencyRole.ADMIN),
        AgencyMembership(user_id=users[1].id, agency_id=agencies[0].id, role=AgencyRole.ADMIN),
        AgencyMembership(user_id=users[2].id, agency_id=agencies[0].id, role=AgencyRole.MEMBER),
        AgencyMembership(user_id=users[1].id, agency_id=agencies[1].id, role=AgencyRole.ADMIN),
    ]
    
    for membership in memberships:
        db.add(membership)
    
    db.commit()
    print(f"  Created {len(memberships)} agency memberships")
    return memberships

def seed_clients(db: Session, agencies: list):
    """Seed Clients table"""
    print("Seeding clients...")
    
    clients_data = [
        {
            "agency_id": agencies[0].id,
            "name": "Tech Startup Inc",
            "industry": "Technology",
            "website": "https://techstartup.com",
            "markup_percent": Decimal("1.1500"),  # 15% markup
            "is_active": True
        },
        {
            "agency_id": agencies[0].id,
            "name": "Fashion Brand Co",
            "industry": "Retail",
            "website": "https://fashionbrand.com",
            "markup_percent": Decimal("1.2000"),  # 20% markup
            "is_active": True
        },
        {
            "agency_id": agencies[0].id,
            "name": "Local Restaurant",
            "industry": "Food & Beverage",
            "website": "https://localrestaurant.com",
            "markup_percent": Decimal("1.1000"),  # 10% markup
            "is_active": False
        },
        {
            "agency_id": agencies[1].id,
            "name": "Small Business",
            "industry": "Services",
            "website": "https://smallbusiness.com",
            "markup_percent": Decimal("1.0000"),  # No markup
            "is_active": True
        }
    ]
    
    clients = []
    for client_data in clients_data:
        client = Client(**client_data)
        db.add(client)
        clients.append(client)
    
    db.commit()
    for client in clients:
        db.refresh(client)
    
    print(f"  Created {len(clients)} clients")
    return clients

def seed_client_memberships(db: Session, users: list, clients: list):
    """Seed ClientMemberships table"""
    print("Seeding client memberships...")
    
    memberships = [
        ClientMembership(user_id=users[1].id, client_id=clients[0].id, role=ClientRole.OPERATOR),
        ClientMembership(user_id=users[2].id, client_id=clients[0].id, role=ClientRole.VIEWER),
        ClientMembership(user_id=users[3].id, client_id=clients[0].id, role=ClientRole.OPERATOR),
        ClientMembership(user_id=users[1].id, client_id=clients[1].id, role=ClientRole.OPERATOR),
        ClientMembership(user_id=users[1].id, client_id=clients[2].id, role=ClientRole.VIEWER),
    ]
    
    for membership in memberships:
        db.add(membership)
    
    db.commit()
    print(f"  Created {len(memberships)} client memberships")
    return memberships

def seed_client_user_permissions(db: Session, users: list, clients: list):
    """Seed ClientUserPermissions table"""
    print("Seeding client user permissions...")
    
    permissions = [
        ClientUserPermission(user_id=users[1].id, client_id=clients[0].id, role="client_operator"),
        ClientUserPermission(user_id=users[3].id, client_id=clients[0].id, role="client_operator"),
    ]
    
    for permission in permissions:
        db.add(permission)
    
    db.commit()
    print(f"  Created {len(permissions)} client user permissions")
    return permissions

def seed_audiences(db: Session, clients: list):
    """Seed Audiences table"""
    print("Seeding audiences...")
    
    audiences_data = [
        {
            "client_id": clients[0].id,
            "account_id": 1,
            "name": "Tech Enthusiasts",
            "description": "Ages 25-45, interested in technology",
            "is_uploaded": True,
            "definition_json": {"age_min": 25, "age_max": 45, "interests": ["technology", "software"]},
            "platform_audience_ids_json": {"meta": "aud_meta_123", "google": "aud_google_456"}
        },
        {
            "client_id": clients[0].id,
            "account_id": 1,
            "name": "Business Decision Makers",
            "description": "B2B audience",
            "is_uploaded": False,
            "definition_json": {"job_titles": ["CEO", "CTO", "VP"], "company_size": "50-500"},
            "platform_audience_ids_json": {}
        },
        {
            "client_id": clients[1].id,
            "account_id": 1,
            "name": "Fashion Lovers",
            "description": "Ages 18-35, interested in fashion",
            "is_uploaded": True,
            "definition_json": {"age_min": 18, "age_max": 35, "interests": ["fashion", "shopping"]},
            "platform_audience_ids_json": {"meta": "aud_meta_789", "tiktok": "aud_tiktok_101"}
        },
        {
            "client_id": clients[2].id,
            "account_id": 1,
            "name": "Local Foodies",
            "description": "Local area, interested in food",
            "is_uploaded": False,
            "definition_json": {"location": "San Francisco", "radius": "10km", "interests": ["food", "restaurants"]},
            "platform_audience_ids_json": {}
        }
    ]
    
    audiences = []
    for audience_data in audiences_data:
        audience = Audience(**audience_data)
        db.add(audience)
        audiences.append(audience)
    
    db.commit()
    for audience in audiences:
        db.refresh(audience)
    
    print(f"  Created {len(audiences)} audiences")
    return audiences

def seed_platform_accounts(db: Session, clients: list):
    """Seed PlatformAccounts table"""
    print("Seeding platform accounts...")
    
    platforms = ["meta", "google", "tiktok"]
    accounts = []
    
    for client in clients[:3]:  # Only for first 3 clients
        for platform in platforms:
            account = PlatformAccount(
                client_id=client.id,
                platform=platform,
                account_id=f"{platform}_acc_{client.id}_123",
                access_token=f"token_{platform}_{client.id}",
                refresh_token=f"refresh_{platform}_{client.id}"
            )
            db.add(account)
            accounts.append(account)
    
    db.commit()
    for account in accounts:
        db.refresh(account)
    
    print(f"  Created {len(accounts)} platform accounts")
    return accounts

def seed_plans(db: Session, audiences: list):
    """Seed Plans table"""
    print("Seeding plans...")
    
    plans_data = [
        {
            "account_id": 1,
            "name": "Q1 Awareness Campaign",
            "goal": "awareness",
            "total_budget_cents": 500000,  # $5000
            "audience_id": audiences[0].id,
            "platform_allocations_json": {"meta": 300000, "google": 200000},
            "status": PlanStatus.CONVERTED
        },
        {
            "account_id": 1,
            "name": "Traffic Drive Campaign",
            "goal": "traffic",
            "total_budget_cents": 300000,  # $3000
            "audience_id": audiences[0].id,
            "platform_allocations_json": {"meta": 200000, "tiktok": 100000},
            "status": PlanStatus.DRAFT
        },
        {
            "account_id": 1,
            "name": "Conversion Campaign",
            "goal": "conversion",
            "total_budget_cents": 750000,  # $7500
            "audience_id": audiences[1].id,
            "platform_allocations_json": {"google": 500000, "meta": 250000},
            "status": PlanStatus.CONVERTED
        },
        {
            "account_id": 1,
            "name": "Fashion Brand Launch",
            "goal": "awareness",
            "total_budget_cents": 1000000,  # $10000
            "audience_id": audiences[2].id,
            "platform_allocations_json": {"meta": 600000, "tiktok": 400000},
            "status": PlanStatus.DRAFT
        }
    ]
    
    plans = []
    for plan_data in plans_data:
        plan = Plan(**plan_data)
        db.add(plan)
        plans.append(plan)
    
    db.commit()
    for plan in plans:
        db.refresh(plan)
    
    print(f"  Created {len(plans)} plans")
    return plans

def seed_campaigns(db: Session, clients: list, audiences: list, plans: list):
    """Seed Campaigns table"""
    print("Seeding campaigns...")
    
    campaigns_data = [
        {
            "client_id": clients[0].id,
            "audience_id": audiences[0].id,
            "plan_id": plans[0].id,
            "account_id": 1,
            "name": "Q1 Awareness Campaign",
            "goal": "awareness",
            "total_budget_cents": 500000,
            "status": CampaignStatus.ACTIVE,
            "start_date": datetime.utcnow() - timedelta(days=10),
            "end_date": datetime.utcnow() + timedelta(days=50),
            "platform_allocations": {"meta": 300000, "google": 200000},
            "platform_campaign_ids": {"meta": "cmp_meta_123", "google": "cmp_google_456"}
        },
        {
            "client_id": clients[0].id,
            "audience_id": audiences[1].id,
            "plan_id": plans[2].id,
            "account_id": 1,
            "name": "Conversion Campaign",
            "goal": "conversion",
            "total_budget_cents": 750000,
            "status": CampaignStatus.PAUSED,
            "start_date": datetime.utcnow() - timedelta(days=5),
            "end_date": datetime.utcnow() + timedelta(days=55),
            "platform_allocations": {"google": 500000, "meta": 250000},
            "platform_campaign_ids": {"google": "cmp_google_789", "meta": "cmp_meta_101"}
        },
        {
            "client_id": clients[1].id,
            "audience_id": audiences[2].id,
            "plan_id": None,
            "account_id": 1,
            "name": "Fashion Brand Test",
            "goal": "traffic",
            "total_budget_cents": 200000,
            "status": CampaignStatus.DRAFT,
            "start_date": None,
            "end_date": None,
            "platform_allocations": {},
            "platform_campaign_ids": {}
        }
    ]
    
    campaigns = []
    for campaign_data in campaigns_data:
        campaign = Campaign(**campaign_data)
        db.add(campaign)
        campaigns.append(campaign)
    
    db.commit()
    for campaign in campaigns:
        db.refresh(campaign)
    
    print(f"  Created {len(campaigns)} campaigns")
    return campaigns

def seed_invoices(db: Session, agencies: list, clients: list):
    """Seed Invoices table"""
    print("Seeding invoices...")
    
    now = datetime.utcnow()
    invoices_data = [
        {
            "agency_id": agencies[0].id,
            "client_id": clients[0].id,
            "period_start": now - timedelta(days=30),
            "period_end": now,
            "plan_id": "growth",
            "platform_fees_total": Decimal("4500.00"),
            "kaivo_fees_total": Decimal("450.00"),
            "agency_markup_total": Decimal("675.00"),
            "grand_total": Decimal("5625.00"),
            "status": InvoiceStatus.SENT
        },
        {
            "agency_id": agencies[0].id,
            "client_id": clients[1].id,
            "period_start": now - timedelta(days=30),
            "period_end": now,
            "plan_id": "growth",
            "platform_fees_total": Decimal("3000.00"),
            "kaivo_fees_total": Decimal("300.00"),
            "agency_markup_total": Decimal("450.00"),
            "grand_total": Decimal("3750.00"),
            "status": InvoiceStatus.DRAFT
        }
    ]
    
    invoices = []
    for invoice_data in invoices_data:
        invoice = Invoice(**invoice_data)
        db.add(invoice)
        invoices.append(invoice)
    
    db.commit()
    for invoice in invoices:
        db.refresh(invoice)
    
    print(f"  Created {len(invoices)} invoices")
    return invoices

def seed_usage_records(db: Session, campaigns: list):
    """Seed UsageRecords table"""
    print("Seeding usage records...")
    
    # Only create usage records for active campaigns
    active_campaigns = [c for c in campaigns if c.status == CampaignStatus.ACTIVE]
    
    if not active_campaigns:
        print("  No active campaigns, skipping usage records")
        return []
    
    records = []
    campaign = active_campaigns[0]
    
    # Create 7 days of usage records
    for day_offset in range(7):
        date = datetime.utcnow() - timedelta(days=6-day_offset)
        
        # Meta records
        records.append(UsageRecord(
            campaign_id=campaign.id,
            date=date,
            platform="meta",
            impressions=10000 + (day_offset * 500),
            clicks=200 + (day_offset * 10),
            spend_base=Decimal("150.00") + Decimal(str(day_offset * 5)),
            spend_kaivo=Decimal("165.00") + Decimal(str(day_offset * 5.5)),
            spend_agency=Decimal("189.75") + Decimal(str(day_offset * 6.325))
        ))
        
        # Google records
        records.append(UsageRecord(
            campaign_id=campaign.id,
            date=date,
            platform="google",
            impressions=8000 + (day_offset * 400),
            clicks=150 + (day_offset * 8),
            spend_base=Decimal("100.00") + Decimal(str(day_offset * 3)),
            spend_kaivo=Decimal("110.00") + Decimal(str(day_offset * 3.3)),
            spend_agency=Decimal("126.50") + Decimal(str(day_offset * 3.795))
        ))
    
    for record in records:
        db.add(record)
    
    db.commit()
    print(f"  Created {len(records)} usage records")
    return records

def verify_data(db: Session):
    """Verify seeded data and display summary"""
    print("\n" + "="*60)
    print("DATA VERIFICATION SUMMARY")
    print("="*60)
    
    tables = [
        ("Users", User),
        ("Agencies", Agency),
        ("Agency Memberships", AgencyMembership),
        ("Clients", Client),
        ("Client Memberships", ClientMembership),
        ("Client User Permissions", ClientUserPermission),
        ("Audiences", Audience),
        ("Platform Accounts", PlatformAccount),
        ("Plans", Plan),
        ("Campaigns", Campaign),
        ("Invoices", Invoice),
        ("Usage Records", UsageRecord),
    ]
    
    total = 0
    for name, model in tables:
        count = db.query(model).count()
        total += count
        print(f"  {name:.<30} {count:>5}")
    
    print("="*60)
    print(f"  {'TOTAL':.<30} {total:>5}")
    print("="*60)
    
    # Verify foreign key relationships
    print("\nForeign Key Verification:")
    
    # Check agency memberships
    agency_memberships = db.query(AgencyMembership).all()
    for am in agency_memberships:
        user = db.query(User).filter(User.id == am.user_id).first()
        agency = db.query(Agency).filter(Agency.id == am.agency_id).first()
        if not user or not agency:
            print(f"  ERROR: AgencyMembership {am.id} has invalid foreign keys")
        else:
            print(f"  OK: AgencyMembership {am.id} -> User {user.email} in Agency {agency.name}")
    
    # Check clients
    clients = db.query(Client).all()
    for client in clients:
        agency = db.query(Agency).filter(Agency.id == client.agency_id).first()
        if not agency:
            print(f"  ERROR: Client {client.id} has invalid agency_id")
        else:
            print(f"  OK: Client {client.name} belongs to Agency {agency.name}")
    
    # Check campaigns
    campaigns = db.query(Campaign).all()
    for campaign in campaigns:
        if campaign.client_id:
            client = db.query(Client).filter(Client.id == campaign.client_id).first()
            if not client:
                print(f"  ERROR: Campaign {campaign.id} has invalid client_id")
            else:
                print(f"  OK: Campaign {campaign.name} belongs to Client {client.name}")
    
    print("\nVerification complete!")

def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Seed Kaivo database with test data")
    parser.add_argument("--reset", action="store_true", help="Reset all tables before seeding")
    parser.add_argument("--verify-only", action="store_true", help="Only verify existing data, don't seed")
    args = parser.parse_args()
    
    db = SessionLocal()
    
    try:
        if args.verify_only:
            verify_data(db)
            return
        
        if args.reset:
            reset_tables(db)
        
        print("\nStarting database seeding...\n")
        
        # Seed in dependency order
        users = seed_users(db)
        agencies = seed_agencies(db)
        agency_memberships = seed_agency_memberships(db, users, agencies)
        clients = seed_clients(db, agencies)
        client_memberships = seed_client_memberships(db, users, clients)
        client_permissions = seed_client_user_permissions(db, users, clients)
        audiences = seed_audiences(db, clients)
        platform_accounts = seed_platform_accounts(db, clients)
        plans = seed_plans(db, audiences)
        campaigns = seed_campaigns(db, clients, audiences, plans)
        invoices = seed_invoices(db, agencies, clients)
        usage_records = seed_usage_records(db, campaigns)
        
        print("\nSeeding complete!\n")
        
        # Verify
        verify_data(db)
        
    except Exception as e:
        db.rollback()
        print(f"\nERROR: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    main()

