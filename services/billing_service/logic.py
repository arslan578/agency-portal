"""
Billing Service Business Logic

All billing operations are performed at the Agency level.
Credits are stored in Agency.credits and transactions are linked via agency_id.
"""

import stripe
import os
import logging
from typing import Optional
from fastapi import HTTPException
from sqlalchemy.orm import Session
from decimal import Decimal
from datetime import datetime

logger = logging.getLogger(__name__)

from .models import CreditTransaction
from packages.db.models import Subscription, Agency, PlanTier, Client

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")


def get_credit_balance(agency_id: int, db: Session) -> dict:
    """Get current credit balance for an agency"""
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise HTTPException(status_code=404, detail="Agency not found")
    
    return {
        "agency_id": agency_id,
        "credits": float(agency.credits),
        "currency": "USD"
    }


def create_credit_purchase(agency_id: int, amount: Decimal, db: Session) -> dict:
    """Create Stripe Checkout Session for credit purchase"""
    
    if amount < 20:
        raise HTTPException(status_code=400, detail="Minimum purchase is $20")
    if amount > 50000:
        raise HTTPException(status_code=400, detail="Maximum purchase is $50,000")
    
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise HTTPException(status_code=404, detail="Agency not found")
    
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=['card'],
            allow_promotion_codes=True,
            line_items=[{
                'price': 'price_1StsZqLRKEAKKmcBxubUTJeD',
                'quantity': int(amount),
            }],
            mode='payment',
            success_url=f"{frontend_url}/billing?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{frontend_url}/billing",
            metadata={
                "agency_id": str(agency_id),
                "credits": str(amount),
                "type": "credit_purchase"
            }
        )
        
        return {
            "url": session.url,
            "session_id": session.id,
            "amount": float(amount),
            "credits_to_add": float(amount)
        }
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=400, detail=f"Stripe error: {str(e)}")


def create_subscription_checkout(agency_id: int, plan_id: str, price_cents: int, plan_name: str, db: Session, stripe_price_id: str = None) -> dict:
    """Create Stripe Checkout Session for subscription"""
    
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise HTTPException(status_code=404, detail="Agency not found")
    
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")

    try:
        line_item = {}
        if stripe_price_id:
            line_item = {
                'price': stripe_price_id,
                'quantity': 1
            }
        else:
            line_item = {
                'price_data': {
                    'currency': 'usd',
                    'product_data': {
                        'name': f"Kaivo {plan_name} Plan",
                        'description': 'Monthly subscription',
                    },
                    'unit_amount': price_cents,
                    'recurring': {
                        'interval': 'month',
                    },
                },
                'quantity': 1,
            }

        session = stripe.checkout.Session.create(
            payment_method_types=['card'],
            allow_promotion_codes=True,
            line_items=[line_item],
            mode='subscription',
            success_url=f"{frontend_url}/billing?session_id={{CHECKOUT_SESSION_ID}}&mode=subscription",
            cancel_url=f"{frontend_url}/billing",
            client_reference_id=str(agency_id),
            metadata={
                "agency_id": str(agency_id),
                "plan_id": plan_id,
                "type": "subscription_start"
            },
            subscription_data={
                "metadata": {
                    "agency_id": str(agency_id),
                    "plan_id": plan_id
                }
            }
        )
        
        return {
            "url": session.url,
            "session_id": session.id
        }
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=400, detail=f"Stripe error: {str(e)}")


def confirm_credit_purchase(session_id: str, agency_id: int, db: Session) -> dict:
    """Confirm payment and add credits to agency"""
    
    try:
        if not session_id:
            raise HTTPException(status_code=400, detail="Missing session_id")

        session = stripe.checkout.Session.retrieve(session_id)
        if session.payment_status != 'paid':
            raise HTTPException(status_code=400, detail=f"Payment status: {session.payment_status}")
        
        metadata = session.metadata
        
        metadata_agency_id = metadata.get("agency_id")
        if metadata_agency_id and int(metadata_agency_id) != agency_id:
            raise HTTPException(status_code=403, detail="Agency ID mismatch")
        
        agency = db.query(Agency).filter(Agency.id == agency_id).first()
        if not agency:
            raise HTTPException(status_code=404, detail="Agency not found")
        
        existing_transaction = db.query(CreditTransaction).filter(
            CreditTransaction.stripe_payment_id == session.id
        ).first()
        
        if existing_transaction:
            return {
                "success": True,
                "credits_added": float(existing_transaction.amount),
                "new_balance": float(agency.credits),
                "message": "Already processed"
            }
        
        credits_to_add = Decimal(metadata.get("credits", "0"))
        agency.credits += credits_to_add
        
        transaction = CreditTransaction(
            agency_id=agency_id,
            amount=credits_to_add,
            transaction_type="purchase",
            description=f"Credit purchase: ${credits_to_add}",
            stripe_payment_id=session.id
        )
        db.add(transaction)
        db.commit()
        db.refresh(agency)
        
        return {
            "success": True,
            "credits_added": float(credits_to_add),
            "new_balance": float(agency.credits)
        }
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=400, detail=f"Stripe error: {str(e)}")


def get_transactions(agency_id: int, db: Session, limit: int = 50) -> list:
    """Get transaction history for an agency"""
    transactions = db.query(CreditTransaction).filter(
        CreditTransaction.agency_id == agency_id
    ).order_by(CreditTransaction.created_at.desc()).limit(limit).all()
    
    return transactions


def deduct_credits(agency_id: int, amount: Decimal, transaction_type: str, description: str, db: Session, client_id: Optional[int] = None) -> dict:
    """Deduct credits from agency balance (for campaigns, etc.)
    
    If client_id is provided and the client is in 'reporting_only' mode,
    the deduction is blocked because reporting-only clients don't consume
    ad credits through Kaivo.
    """
    if client_id:
        client = db.query(Client).filter(Client.id == client_id).first()
        if client and getattr(client, 'account_mode', 'kaivo_managed') == 'reporting_only':
            raise HTTPException(
                status_code=400,
                detail="This client is in reporting-only mode. Ad credit deductions "
                       "are not applicable — they use their own platform accounts."
            )

    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise HTTPException(status_code=404, detail="Agency not found")
    
    if agency.credits < amount:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient credits. Have ${agency.credits}, need ${amount}"
        )
    
    agency.credits -= amount
    
    transaction = CreditTransaction(
        agency_id=agency_id,
        amount=-amount,
        transaction_type=transaction_type,
        description=description
    )
    db.add(transaction)
    db.commit()
    db.refresh(agency)
    
    return {
        "success": True,
        "credits_deducted": float(amount),
        "new_balance": float(agency.credits)
    }


def add_credits(agency_id: int, amount: Decimal, transaction_type: str, description: str, db: Session, stripe_payment_id: str = None) -> dict:
    """Add credits to agency balance"""
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise HTTPException(status_code=404, detail="Agency not found")
    
    agency.credits += amount
    
    transaction = CreditTransaction(
        agency_id=agency_id,
        amount=amount,
        transaction_type=transaction_type,
        description=description,
        stripe_payment_id=stripe_payment_id
    )
    db.add(transaction)
    db.commit()
    db.refresh(agency)
    
    return {
        "success": True,
        "credits_added": float(amount),
        "new_balance": float(agency.credits)
    }


def confirm_subscription(session_id: str, agency_id: int, db: Session) -> dict:
    """Confirm subscription after Stripe checkout"""
    
    try:
        session = stripe.checkout.Session.retrieve(session_id)
        
        if session.payment_status != 'paid':
            raise HTTPException(status_code=400, detail=f"Payment not completed: {session.payment_status}")
        
        subscription_id = session.subscription
        if not subscription_id:
            raise HTTPException(status_code=400, detail="No subscription found in session")
        
        stripe_subscription = stripe.Subscription.retrieve(subscription_id)
        
        metadata = session.metadata or {}
        plan_id = metadata.get('plan_id', 'starter')
        
        agency = db.query(Agency).filter(Agency.id == agency_id).first()
        if not agency:
            raise HTTPException(status_code=404, detail="Agency not found")
        
        existing = db.query(Subscription).filter(
            Subscription.stripe_subscription_id == subscription_id
        ).first()
        
        if existing:
            return {
                "success": True,
                "subscription_id": existing.id,
                "plan_id": existing.plan_id,
                "message": "Subscription already confirmed"
            }
        
        period_start = stripe_subscription.get('current_period_start') or stripe_subscription.get('start_date') or 0
        period_end = stripe_subscription.get('current_period_end') or 0
        cancel_at_end = stripe_subscription.get('cancel_at_period_end', False)
        customer_id = stripe_subscription.get('customer', '')
        sub_status = stripe_subscription.get('status', 'active')
        
        subscription = Subscription(
            agency_id=agency_id,
            stripe_subscription_id=subscription_id,
            stripe_customer_id=customer_id,
            plan_id=plan_id,
            status=sub_status,
            current_period_start=datetime.fromtimestamp(period_start) if period_start else None,
            current_period_end=datetime.fromtimestamp(period_end) if period_end else None,
            cancel_at_period_end=cancel_at_end
        )
        db.add(subscription)
        
        plan_tier_map = {
            'starter': PlanTier.STARTER,
            'growth': PlanTier.GROWTH,
            'scale': PlanTier.SCALE,
            'enterprise': PlanTier.ENTERPRISE
        }
        agency.current_plan = plan_tier_map.get(plan_id.lower(), PlanTier.STARTER)
        agency.stripe_customer_id = customer_id
        
        db.commit()
        db.refresh(subscription)
        
        return {
            "success": True,
            "subscription_id": subscription.id,
            "plan_id": plan_id,
            "agency_tier": agency.current_plan.value if agency.current_plan else None
        }
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=400, detail=f"Stripe error: {str(e)}")


async def handle_subscription_created(subscription_data: dict, db: Session):
    """Handle customer.subscription.created webhook event"""
    subscription_id = subscription_data.get('id')
    metadata = subscription_data.get('metadata', {})
    
    existing = db.query(Subscription).filter(
        Subscription.stripe_subscription_id == subscription_id
    ).first()
    
    if existing:
        logger.info(f"Subscription {subscription_id} already exists, skipping")
        return
    
    agency_id = metadata.get('agency_id')
    if not agency_id:
        logger.warning(f"No agency_id in subscription metadata: {subscription_id}")
        return
    
    agency_id = int(agency_id)
    plan_id = metadata.get('plan_id', 'starter')
    
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        logger.warning(f"Agency {agency_id} not found for subscription {subscription_id}")
        return
    
    period_start = subscription_data.get('current_period_start')
    period_end = subscription_data.get('current_period_end')
    
    subscription = Subscription(
        agency_id=agency_id,
        stripe_subscription_id=subscription_id,
        stripe_customer_id=subscription_data.get('customer'),
        plan_id=plan_id,
        status=subscription_data.get('status', 'active'),
        current_period_start=datetime.fromtimestamp(period_start) if period_start else None,
        current_period_end=datetime.fromtimestamp(period_end) if period_end else None,
        cancel_at_period_end=subscription_data.get('cancel_at_period_end', False)
    )
    db.add(subscription)
    
    plan_tier_map = {
        'starter': PlanTier.STARTER,
        'growth': PlanTier.GROWTH,
        'scale': PlanTier.SCALE,
        'enterprise': PlanTier.ENTERPRISE
    }
    agency.current_plan = plan_tier_map.get(plan_id.lower(), PlanTier.STARTER)
    
    db.commit()
    logger.info(f"Created subscription {subscription.id} for agency {agency_id}")


async def handle_subscription_updated(subscription_data: dict, db: Session):
    """Handle customer.subscription.updated webhook event"""
    subscription_id = subscription_data.get('id')
    
    subscription = db.query(Subscription).filter(
        Subscription.stripe_subscription_id == subscription_id
    ).first()
    
    if not subscription:
        logger.warning(f"Subscription not found: {subscription_id}")
        return
    
    subscription.status = subscription_data.get('status', subscription.status)
    
    period_start = subscription_data.get('current_period_start')
    if period_start:
        subscription.current_period_start = datetime.fromtimestamp(period_start)
    
    period_end = subscription_data.get('current_period_end')
    if period_end:
        subscription.current_period_end = datetime.fromtimestamp(period_end)
    
    subscription.cancel_at_period_end = subscription_data.get('cancel_at_period_end', False)
    
    if subscription_data.get('canceled_at'):
        subscription.canceled_at = datetime.fromtimestamp(subscription_data['canceled_at'])
    
    db.commit()
    logger.info(f"Updated subscription {subscription.id}")


async def handle_subscription_deleted(subscription_data: dict, db: Session):
    """Handle customer.subscription.deleted webhook event"""
    subscription_id = subscription_data.get('id')
    
    subscription = db.query(Subscription).filter(
        Subscription.stripe_subscription_id == subscription_id
    ).first()
    
    if not subscription:
        logger.warning(f"Subscription not found: {subscription_id}")
        return
    
    subscription.status = 'canceled'
    subscription.canceled_at = datetime.utcnow()
    
    agency = db.query(Agency).filter(Agency.id == subscription.agency_id).first()
    if agency:
        agency.current_plan = PlanTier.FREE
    
    db.commit()
    logger.info(f"Canceled subscription {subscription.id}")


def process_subscription_payment(subscription_id: int, amount: Decimal, invoice_id: str, db: Session):
    """Process subscription payment by deducting from agency credits"""
    subscription = db.query(Subscription).filter(Subscription.id == subscription_id).first()
    if not subscription:
        raise HTTPException(status_code=404, detail="Subscription not found")
    
    if not subscription.agency_id:
        raise HTTPException(status_code=400, detail="Subscription has no associated agency")
    
    agency = db.query(Agency).filter(Agency.id == subscription.agency_id).first()
    if not agency:
        raise HTTPException(status_code=404, detail="Agency not found")
    
    if agency.credits < amount:
        subscription.status = 'past_due'
        db.commit()
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient credits for subscription payment. Have ${agency.credits}, need ${amount}"
        )
    
    agency.credits -= amount
    
    transaction = CreditTransaction(
        agency_id=subscription.agency_id,
        amount=-amount,
        transaction_type="subscription_payment",
        description=f"Monthly subscription payment: ${amount}",
        stripe_payment_id=invoice_id
    )
    db.add(transaction)
    
    db.commit()
    logger.info(f"Processed subscription payment ${amount} for subscription {subscription_id}")


def sync_stripe_invoice(invoice_id: str, db: Session) -> dict:
    """Sync Stripe invoice and store reference in CreditTransaction"""
    try:
        invoice = stripe.Invoice.retrieve(invoice_id)
        
        subscription = None
        if invoice.subscription:
            subscription = db.query(Subscription).filter(
                Subscription.stripe_subscription_id == invoice.subscription
            ).first()
        
        transaction = db.query(CreditTransaction).filter(
            CreditTransaction.stripe_payment_id == invoice_id
        ).first()
        
        if not transaction:
            agency_id = None
            if subscription and subscription.agency_id:
                agency_id = subscription.agency_id
            elif invoice.metadata and invoice.metadata.get('agency_id'):
                agency_id = int(invoice.metadata['agency_id'])
            
            if agency_id:
                amount = Decimal(invoice.amount_paid) / 100
                transaction_type = "subscription_payment" if invoice.subscription else "purchase"
                
                transaction = CreditTransaction(
                    agency_id=agency_id,
                    amount=amount,
                    transaction_type=transaction_type,
                    description=f"Invoice {invoice.number}: {invoice.description or 'Payment'}",
                    stripe_payment_id=invoice_id
                )
                db.add(transaction)
                db.commit()
                logger.info(f"Created transaction record for invoice {invoice_id}")
        
        return {
            "invoice_id": invoice_id,
            "invoice_number": invoice.number,
            "amount": float(Decimal(invoice.amount_paid) / 100),
            "status": invoice.status,
            "subscription_id": subscription.id if subscription else None
        }
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=400, detail=f"Stripe error: {str(e)}")
