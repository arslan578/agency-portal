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
from .onboarding import create_onboarding_magic_link
from .email import send_onboarding_magic_link_email
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
        logger.warning("STRIPE_WEBHOOK_SECRET not configured — skipping signature verification (dev mode)")
        body = await request.body()
        import json
        try:
            event = json.loads(body)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON payload")
    else:
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
    """
    Handle checkout.session.completed event.

    Two cases:
    1. Existing agency buying credits → metadata contains agency_id → confirm purchase.
    2. New user paid on getkaivo.com → no agency_id in metadata → generate a
       magic link and send an onboarding email so they can access agency.getkaivo.com.
    """
    session_id = session_data.get('id')
    mode = session_data.get('mode')
    metadata = session_data.get('metadata', {})

    logger.info(f"Processing checkout session: {session_id}, mode: {mode}")

    agency_id = metadata.get('agency_id')

    # ── Case 1: Existing agency credit purchase ──
    if mode == 'payment' and agency_id:
        try:
            confirm_credit_purchase(
                session_id=session_id,
                agency_id=int(agency_id),
                db=db,
            )
            logger.info(f"Confirmed credit purchase for agency {agency_id}")
        except Exception as e:
            logger.error(f"Error confirming credit purchase: {e}")
            raise
        return

    # ── Case 2: New user onboarding (payment or subscription from getkaivo.com) ──
    # Extract email: customer_email → customer_details.email → metadata.email
    customer_email = session_data.get('customer_email')
    if not customer_email:
        customer_details = session_data.get('customer_details') or {}
        customer_email = customer_details.get('email')
    if not customer_email:
        customer_email = metadata.get('email')

    if not customer_email:
        logger.warning(
            "checkout.session.completed (%s) has no agency_id and no customer email — skipping onboarding",
            session_id,
        )
        return

    customer_email = customer_email.lower().strip()
    plan_name = metadata.get('plan_name', 'Agency')
    stripe_customer_id = session_data.get('customer')

    logger.info(
        "New user payment detected — generating onboarding magic link for %s (session=%s, plan=%s)",
        customer_email,
        session_id,
        plan_name,
    )

    magic_url, error = create_onboarding_magic_link(
        email=customer_email,
        db=db,
        stripe_customer_id=stripe_customer_id,
    )

    if not magic_url:
        logger.error(
            "Failed to create onboarding magic link for %s: %s",
            customer_email,
            error,
        )
        return

    email_sent, email_debug = send_onboarding_magic_link_email(
        to_email=customer_email,
        magic_url=magic_url,
        plan_name=plan_name,
    )

    if email_sent:
        logger.info("Onboarding email sent to %s (magic link created)", customer_email)
    else:
        logger.warning(
            "Onboarding magic link created for %s but email not sent (%s). Link: %s",
            customer_email,
            email_debug,
            magic_url,
        )


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
