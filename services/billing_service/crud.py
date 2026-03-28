from sqlalchemy.orm import Session
from . import models, schemas
from decimal import Decimal

# Stub for Stripe
def charge_stripe(amount: Decimal, payment_method_id: str):
    # In a real implementation, this would call Stripe API
    # For now, we assume success if payment_method_id starts with 'pm_'
    if payment_method_id.startswith("pm_"):
        return "ch_test_12345"
    return None

def get_balance(db: Session, account_id: int):
    balance = db.query(models.CreditBalance).filter(models.CreditBalance.account_id == account_id).first()
    if not balance:
        balance = models.CreditBalance(account_id=account_id, amount=0.00)
        db.add(balance)
        db.commit()
        db.refresh(balance)
    return balance

def purchase_credits(db: Session, purchase: schemas.CreditPurchase):
    # 1. Charge Stripe
    charge_id = charge_stripe(purchase.amount, purchase.payment_method_id)
    if not charge_id:
        raise Exception("Payment failed")

    # 2. Update Balance
    balance = get_balance(db, purchase.account_id)
    balance.amount += purchase.amount
    
    # 3. Record Transaction
    transaction = models.Transaction(
        account_id=purchase.account_id,
        amount=purchase.amount,
        type="credit_purchase",
        description=f"Purchased {purchase.amount} credits",
        stripe_charge_id=charge_id
    )
    
    db.add(transaction)
    db.commit()
    db.refresh(balance)
    return balance
