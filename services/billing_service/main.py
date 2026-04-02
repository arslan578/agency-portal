"""
Billing Service API

All billing operations are performed at the Agency level.
Credits, subscriptions, and transactions are linked to agencies.
"""

from fastapi import FastAPI, APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from packages.db.database import get_db
from packages.db.models import Subscription, Agency, PlanTier, Client
from decimal import Decimal
import logging
import stripe
import os

logger = logging.getLogger(__name__)

from .schemas import (
    CreditBalanceResponse,
    PurchaseRequest,
    PurchaseResponse,
    ConfirmRequest,
    ConfirmResponse,
    TransactionResponse,
    SubscriptionCheckoutRequest,
    SubscriptionConfirmRequest,
    SubscriptionResponse,
    SubscriptionCancelRequest,
    SubscriptionUpdateRequest
)
from .logic import (
    get_credit_balance,
    create_credit_purchase,
    confirm_credit_purchase,
    get_transactions,
    deduct_credits,
    create_subscription_checkout,
    confirm_subscription
)
from .webhooks import router as webhook_router

app = FastAPI()
router = APIRouter(prefix="/billing", tags=["Billing"])


@router.get("/credits/balance", response_model=CreditBalanceResponse)
def get_balance(agency_id: int, db: Session = Depends(get_db)):
    """Get current credit balance for an agency"""
    return get_credit_balance(agency_id, db)


@router.post("/credits/purchase", response_model=PurchaseResponse)
def purchase_credits(request: PurchaseRequest, db: Session = Depends(get_db)):
    """Create Stripe Checkout Session for credit purchase"""
    return create_credit_purchase(request.agency_id, request.amount, db)


# Agencies may only subscribe to Enterprise plan (product requirement)
AGENCY_ALLOWED_PLAN_ID = "enterprise"


@router.post("/subscription/checkout")
def start_subscription_checkout(request: SubscriptionCheckoutRequest, db: Session = Depends(get_db)):
    """Create Stripe Checkout Session for subscription. Agencies may only select Enterprise plan."""
    plan_id_lower = (request.plan_id or "").strip().lower()
    if plan_id_lower != AGENCY_ALLOWED_PLAN_ID:
        raise HTTPException(
            status_code=400,
            detail="Agencies must subscribe to the Enterprise plan only. Please select Enterprise.",
        )
    return create_subscription_checkout(
        agency_id=request.agency_id,
        plan_id=request.plan_id,
        price_cents=request.price_cents,
        plan_name=request.plan_name,
        db=db,
        stripe_price_id=request.stripe_price_id
    )


@router.post("/credits/confirm", response_model=ConfirmResponse)
def confirm_purchase(request: ConfirmRequest, db: Session = Depends(get_db)):
    """Confirm payment and add credits to agency balance"""
    return confirm_credit_purchase(request.session_id, request.agency_id, db)


@router.get("/credits/transactions", response_model=list[TransactionResponse])
def list_transactions(agency_id: int, limit: int = 50, db: Session = Depends(get_db)):
    """Get transaction history for an agency"""
    return get_transactions(agency_id, db, limit)


@router.post("/credits/deduct")
def deduct_agency_credits(
    agency_id: int,
    amount: Decimal,
    transaction_type: str,
    description: str,
    db: Session = Depends(get_db)
):
    """Deduct credits from agency balance"""
    return deduct_credits(agency_id, amount, transaction_type, description, db)


@router.post("/subscription/confirm", response_model=dict)
def confirm_subscription_endpoint(
    request: SubscriptionConfirmRequest,
    db: Session = Depends(get_db)
):
    """Confirm subscription after Stripe checkout"""
    return confirm_subscription(
        session_id=request.session_id,
        agency_id=request.agency_id,
        db=db
    )


@router.get("/subscription/{agency_id}", response_model=SubscriptionResponse)
def get_subscription(agency_id: int, db: Session = Depends(get_db)):
    """Get current subscription for an agency"""
    subscription = db.query(Subscription).filter(
        Subscription.agency_id == agency_id,
        Subscription.status.in_(['active', 'trialing'])
    ).order_by(Subscription.created_at.desc()).first()
    
    if not subscription:
        raise HTTPException(status_code=404, detail="No active subscription found")
    
    return subscription


@router.post("/portal", response_model=dict)
def create_customer_portal(agency_id: int, db: Session = Depends(get_db)):
    """Create a Stripe Customer Portal session for managing subscription"""
    subscription = db.query(Subscription).filter(
        Subscription.agency_id == agency_id,
        Subscription.status.in_(['active', 'trialing', 'past_due'])
    ).order_by(Subscription.created_at.desc()).first()
    
    if not subscription or not subscription.stripe_customer_id:
        raise HTTPException(status_code=404, detail="No subscription found for this agency")
    
    try:
        frontend_url = os.getenv('FRONTEND_URL', 'http://localhost:3000')
        session = stripe.billing_portal.Session.create(
            customer=subscription.stripe_customer_id,
            return_url=f"{frontend_url}/billing"
        )
        return {"url": session.url}
    except stripe.error.StripeError as e:
        logger.error(f"Stripe portal error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Failed to create portal session: {str(e)}")


@router.post("/subscription/cancel", response_model=dict)
def cancel_subscription(request: SubscriptionCancelRequest, db: Session = Depends(get_db)):
    """Cancel a subscription"""
    subscription = db.query(Subscription).filter(Subscription.id == request.subscription_id).first()
    if not subscription:
        raise HTTPException(status_code=404, detail="Subscription not found")
    
    try:
        stripe_subscription = stripe.Subscription.modify(
            subscription.stripe_subscription_id,
            cancel_at_period_end=True
        )
        
        subscription.cancel_at_period_end = True
        subscription.status = stripe_subscription.status
        db.commit()
        
        return {"success": True, "message": "Subscription will be canceled at period end"}
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=400, detail=f"Stripe error: {str(e)}")


@router.get("/invoices/{invoice_id}", response_model=dict)
def get_invoice(invoice_id: str, db: Session = Depends(get_db)):
    """Get invoice details from Stripe"""
    from .logic import sync_stripe_invoice
    return sync_stripe_invoice(invoice_id, db)


@router.get("/invoices", response_model=list)
def list_invoices(agency_id: int, limit: int = 50, db: Session = Depends(get_db)):
    """List invoices for an agency"""
    subscriptions = db.query(Subscription).filter(
        Subscription.agency_id == agency_id
    ).all()
    
    if not subscriptions:
        return []
    
    all_invoices = []
    for subscription in subscriptions:
        try:
            invoices = stripe.Invoice.list(
                subscription=subscription.stripe_subscription_id,
                limit=limit
            )
            for invoice in invoices.data:
                all_invoices.append({
                    "id": invoice.id,
                    "number": invoice.number,
                    "amount": float(invoice.amount_paid / 100),
                    "status": invoice.status,
                    "created": invoice.created,
                    "subscription_id": subscription.id
                })
        except stripe.error.StripeError as e:
            logger.error(f"Error fetching invoices for subscription {subscription.id}: {e}")
    
    all_invoices.sort(key=lambda x: x['created'], reverse=True)
    return all_invoices[:limit]


@router.post("/subscription/update", response_model=dict)
def update_subscription(request: SubscriptionUpdateRequest, db: Session = Depends(get_db)):
    """Update subscription plan. Agencies may only have Enterprise plan."""
    subscription = db.query(Subscription).filter(Subscription.id == request.subscription_id).first()
    if not subscription:
        raise HTTPException(status_code=404, detail="Subscription not found")
    
    plan_id_lower = (request.plan_id or "").strip().lower()
    if plan_id_lower != AGENCY_ALLOWED_PLAN_ID:
        raise HTTPException(
            status_code=400,
            detail="Agencies must use the Enterprise plan only. Please select Enterprise.",
        )
    
    plan_to_price = {
        'starter': 'price_1StsXNLRKEAKKmcBHF5OruGP',
        'growth': 'price_1StsZKLRKEAKKmcBJsrgMLai',
        'scale': 'price_1StsZWLRKEAKKmcBgIb2vdtH',
        'enterprise': 'price_1StsaPLRKEAKKmcBOYy6pX0L'
    }
    
    new_price_id = plan_to_price.get(plan_id_lower)
    if not new_price_id:
        raise HTTPException(status_code=400, detail=f"Invalid plan_id: {request.plan_id}")
    
    try:
        stripe_subscription_current = stripe.Subscription.retrieve(subscription.stripe_subscription_id)
        
        stripe_subscription = stripe.Subscription.modify(
            subscription.stripe_subscription_id,
            items=[{
                'id': stripe_subscription_current.items.data[0].id,
                'price': new_price_id,
            }],
            proration_behavior='always_invoice'
        )
        
        subscription.plan_id = request.plan_id
        subscription.status = stripe_subscription.status
        
        plan_tier_map = {
            'starter': PlanTier.STARTER,
            'growth': PlanTier.GROWTH,
            'scale': PlanTier.SCALE,
            'enterprise': PlanTier.ENTERPRISE
        }
        
        agency = db.query(Agency).filter(Agency.id == subscription.agency_id).first()
        if agency:
            agency.current_plan = plan_tier_map.get(request.plan_id.lower(), PlanTier.STARTER)
        
        db.commit()
        
        return {"success": True, "message": "Subscription updated"}
    except stripe.error.StripeError as e:
        raise HTTPException(status_code=400, detail=f"Stripe error: {str(e)}")


@router.get("/billing-mode/{client_id}", response_model=dict)
def get_client_billing_mode(client_id: int, db: Session = Depends(get_db)):
    """Get the billing mode for a specific client.
    
    Returns whether the client uses Kaivo-managed ads (needs credits)
    or reporting-only mode (just the monthly platform fee).
    """
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    
    mode = getattr(client, 'account_mode', 'kaivo_managed') or 'kaivo_managed'
    
    return {
        "client_id": client.id,
        "client_name": client.name,
        "account_mode": mode,
        "needs_credits": mode == "kaivo_managed",
        "description": (
            "This client runs ads through Kaivo. Ad credits are required for campaign spend."
            if mode == "kaivo_managed"
            else "This client uses their own platform accounts for ad delivery. "
                 "Only the monthly Kaivo platform fee applies."
        ),
    }


@router.get("/agency-billing-summary/{agency_id}", response_model=dict)
def get_agency_billing_summary(agency_id: int, db: Session = Depends(get_db)):
    """Summary of billing modes across all clients in an agency."""
    clients = db.query(Client).filter(Client.agency_id == agency_id).all()
    
    managed = [c for c in clients if (getattr(c, 'account_mode', 'kaivo_managed') or 'kaivo_managed') == 'kaivo_managed']
    reporting = [c for c in clients if getattr(c, 'account_mode', 'kaivo_managed') == 'reporting_only']
    
    return {
        "agency_id": agency_id,
        "total_clients": len(clients),
        "kaivo_managed_count": len(managed),
        "reporting_only_count": len(reporting),
        "kaivo_managed_clients": [{"id": c.id, "name": c.name} for c in managed],
        "reporting_only_clients": [{"id": c.id, "name": c.name} for c in reporting],
    }


# ── Dev-only endpoint to simulate a Stripe checkout for onboarding ──
DEV_MODE = os.getenv("DEV_MODE", "true").lower() in ("1", "true", "yes")

if DEV_MODE:
    from pydantic import BaseModel as _BM, EmailStr

    class SimulatePaymentRequest(_BM):
        email: EmailStr
        plan_name: str = "Agency"

    @router.post("/dev/simulate-payment", tags=["Dev"])
    def simulate_payment(req: SimulatePaymentRequest, db: Session = Depends(get_db)):
        """
        DEV ONLY — Simulate a post-payment onboarding flow.
        Creates a magic link and sends the onboarding email, just like
        a real checkout.session.completed webhook would.
        """
        from .onboarding import create_onboarding_magic_link
        from .email import send_onboarding_magic_link_email

        magic_url, error = create_onboarding_magic_link(
            email=req.email.lower().strip(),
            db=db,
        )
        if not magic_url:
            raise HTTPException(status_code=500, detail=f"Magic link creation failed: {error}")

        email_sent, email_debug = send_onboarding_magic_link_email(
            to_email=req.email.lower().strip(),
            magic_url=magic_url,
            plan_name=req.plan_name,
        )

        return {
            "status": "ok",
            "magic_url": magic_url,
            "email_sent": email_sent,
            "email_debug": email_debug,
        }


app.include_router(router)
app.include_router(webhook_router, prefix="/billing", tags=["Billing Webhooks"])
