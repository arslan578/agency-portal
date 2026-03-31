import os
from dotenv import load_dotenv

load_dotenv()
resend_api_key = os.getenv("RESEND_API_KEY")
print(f"RESEND_API_KEY is {'set' if resend_api_key else 'NOT set'}")

if resend_api_key:
    from services.account_service.email import send_agency_invite_email
    email_sent, email_debug = send_agency_invite_email(
        to_email="member-test@agency.com",
        invite_url="http://localhost:3000/auth/accept-invite?token=member-test-token-001",
        agency_name="Kaivo Demo Agency",
        role_label="Creative Manager"
    )
    print(f"Sent: {email_sent}, Debug: {email_debug}")
