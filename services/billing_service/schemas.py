from pydantic import BaseModel
from typing import Optional
from decimal import Decimal
from datetime import datetime


class CreditBalanceResponse(BaseModel):
    agency_id: int
    credits: Decimal
    currency: str = "USD"


class PurchaseRequest(BaseModel):
    agency_id: int
    amount: Decimal


class SubscriptionCheckoutRequest(BaseModel):
    agency_id: int
    plan_id: str
    price_cents: int
    plan_name: str
    stripe_price_id: Optional[str] = None


class PurchaseResponse(BaseModel):
    url: Optional[str] = None
    session_id: Optional[str] = None
    amount: Decimal
    credits_to_add: Decimal


class ConfirmRequest(BaseModel):
    session_id: Optional[str] = None
    agency_id: int


class ConfirmResponse(BaseModel):
    success: bool
    credits_added: Decimal
    new_balance: Decimal


class TransactionResponse(BaseModel):
    id: int
    agency_id: int
    amount: Decimal
    transaction_type: str
    description: str
    created_at: str

    class Config:
        from_attributes = True


class SubscriptionConfirmRequest(BaseModel):
    session_id: str
    agency_id: int


class SubscriptionResponse(BaseModel):
    id: int
    agency_id: int
    stripe_subscription_id: str
    stripe_customer_id: Optional[str]
    plan_id: str
    status: str
    current_period_start: Optional[datetime] = None
    current_period_end: Optional[datetime] = None
    cancel_at_period_end: bool = False
    canceled_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SubscriptionCancelRequest(BaseModel):
    subscription_id: int


class SubscriptionUpdateRequest(BaseModel):
    subscription_id: int
    plan_id: str
