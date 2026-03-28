"""ClientOut tolerates NULL markup_percent from PostgreSQL."""

from decimal import Decimal
from types import SimpleNamespace

from services.account_service.schemas_agency import ClientOut


def test_client_out_coerces_null_markup_percent():
    row = SimpleNamespace(
        id=1,
        agency_id=5,
        name="Acme",
        industry=None,
        website=None,
        markup_percent=None,
        is_active=True,
        account_mode="kaivo_managed",
    )
    out = ClientOut.model_validate(row)
    assert out.markup_percent == Decimal("1.0000")


def test_client_out_preserves_explicit_markup():
    row = SimpleNamespace(
        id=2,
        agency_id=5,
        name="Beta",
        industry=None,
        website=None,
        markup_percent=Decimal("1.2500"),
        is_active=True,
        account_mode="kaivo_managed",
    )
    out = ClientOut.model_validate(row)
    assert out.markup_percent == Decimal("1.2500")
