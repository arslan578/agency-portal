"""
Stripe Webhook Handlers

Handles incoming Stripe webhook events for subscriptions and payments.
All billing is linked to agencies via agency_id.
"""

import stripe
import os
import logging
from fastapi import APIRouter, Request, HTTPException, Header, Depends
from sqlalchemy.orm import Session
from packages.db.database import get_db
from typing import Optional

from .logic import (
    confirm_credit_purchase,
    handle_subscription_created,
    handle_subscription_updated,
    handle_subscription_deleted,
    process_subscription_payment,
)
from packages.db.models import Subscription

logger = logging.getLogger(__name__)

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET")

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])


@router.post("/stripe")
async def stripe_webhook(
    request: Request,
    stripe_signature: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """
    Handle Stripe webhook events
    Verifies HMAC signature and routes events to appropriate handlers
    """
    if not webhook_secret:
        logger.error("STRIPE_WEBHOOK_SECRET not configured")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")
    
    if not stripe_signature:
        raise HTTPException(status_code=400, detail="Missing Stripe signature header")
    
    body = await request.body()
    
    try:
        event = stripe.Webhook.construct_event(
            body,
            stripe_signature,
            webhook_secret
        )
    except ValueError as e:
        logger.error(f"Invalid payload: {e}")
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.error.SignatureVerificationError as e:
        logger.error(f"Invalid signature: {e}")
        raise HTTPException(status_code=400, detail="Invalid signature")
    
    event_type = event['type']
    event_data = event['data']['object']
    
    logger.info(f"Received Stripe webhook: {event_type}")
    
    try:
        if event_type == 'checkout.session.completed':
            await handle_checkout_session_completed(event_data, db)
        elif event_type == 'customer.subscription.created':
            await handle_subscription_created(event_data, db)
        elif event_type == 'customer.subscription.updated':
            await handle_subscription_updated(event_data, db)
        elif event_type == 'customer.subscription.deleted':
            await handle_subscription_deleted(event_data, db)
        elif event_type == 'invoice.payment_succeeded':
            await handle_invoice_payment_succeeded(event_data, db)
        elif event_type == 'invoice.payment_failed':
            await handle_invoice_payment_failed(event_data, db)
        else:
            logger.info(f"Unhandled event type: {event_type}")
        
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Error processing webhook {event_type}: {e}", exc_info=True)
        return {"status": "error", "message": str(e)}


async def handle_checkout_session_completed(session_data: dict, db: Session):
    """Handle checkout.session.completed event"""
    session_id = session_data.get('id')
    mode = session_data.get('mode')
    metadata = session_data.get('metadata', {})
    
    logger.info(f"Processing checkout session: {session_id}, mode: {mode}")
    
    if mode == 'payment':
        agency_id = metadata.get('agency_id')
        if agency_id:
            try:
                confirm_credit_purchase(
                    session_id=session_id,
                    agency_id=int(agency_id),
                    db=db
                )
                logger.info(f"Confirmed credit purchase for agency {agency_id}")
            except Exception as e:
                logger.error(f"Error confirming credit purchase: {e}")
                raise
    elif mode == 'subscription':
        logger.info(f"Subscription checkout completed: {session_id}")
    else:
        logger.warning(f"Unknown checkout mode: {mode}")


async def handle_invoice_payment_succeeded(invoice_data: dict, db: Session):
    """Handle invoice.payment_succeeded event"""
    subscription_id = invoice_data.get('subscription')
    if not subscription_id:
        logger.warning("Invoice payment succeeded but no subscription ID")
        return
    
    subscription = db.query(Subscription).filter(
        Subscription.stripe_subscription_id == subscription_id
    ).first()
    
    if not subscription:
        logger.warning(f"Subscription not found for Stripe subscription {subscription_id}")
        return
    
    try:
        amount = invoice_data.get('amount_paid', 0) / 100.0
        process_subscription_payment(
            subscription_id=subscription.id,
            amount=amount,
            invoice_id=invoice_data.get('id'),
            db=db
        )
        logger.info(f"Processed subscription payment for subscription {subscription.id}")
    except Exception as e:
        logger.error(f"Error processing subscription payment: {e}")
        raise


async def handle_invoice_payment_failed(invoice_data: dict, db: Session):
    """Handle invoice.payment_failed event"""
    subscription_id = invoice_data.get('subscription')
    if not subscription_id:
        return
    
    subscription = db.query(Subscription).filter(
        Subscription.stripe_subscription_id == subscription_id
    ).first()
    
    if subscription:
        subscription.status = 'past_due'
        db.commit()
        logger.warning(f"Subscription {subscription.id} marked as past_due due to payment failure")
    else:
        logger.warning(f"Subscription not found for failed payment: {subscription_id}")
