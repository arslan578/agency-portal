# Fix AADSTS650052 - Microsoft Advertising Service Principal

## Your Error

```
AADSTS650052: The app is trying to access a service 
'd42ffc93-c136-491d-b4fd-6f18168c68fd' (Microsoft Advertising API Service) 
that your organization 'getkaivo.onmicrosoft.com' lacks a service principal for.
```

## Root Cause

Your Azure AD tenant (getkaivo.onmicrosoft.com, tenant ID: `c98f01dd-b54a-4036-a53a-7b1f518e735d`) 
does NOT have the **Microsoft Advertising API** service principal provisioned. 
The OAuth flow requests `https://ads.microsoft.com/msads.manage` scope, which 
requires this service principal to exist in the tenant.

## Fix Option 1: Microsoft Graph Explorer (FREE, browser-only)

1. Go to: https://developer.microsoft.com/en-us/graph/graph-explorer
2. Sign in with the **Global Admin** account for `getkaivo.onmicrosoft.com`
3. Change method to **POST**
4. Set URL to: `https://graph.microsoft.com/v1.0/servicePrincipals`
5. Set request body to:
```json
{
  "appId": "d42ffc93-c136-491d-b4fd-6f18168c68fd"
}
```
6. It will prompt for `Application.ReadWrite.All` permission -- approve it
7. Click **Run query** -- you should get a `201 Created` response with the service principal details
8. Done! The service principal is now created in your tenant.

## Fix Option 2: Local PowerShell (FREE, no Azure subscription)

```powershell
Install-Module Microsoft.Graph.Applications -Force -Scope CurrentUser
Connect-MgGraph -TenantId "c98f01dd-b54a-4036-a53a-7b1f518e735d" -Scopes "Application.ReadWrite.All"
New-MgServicePrincipal -AppId "d42ffc93-c136-491d-b4fd-6f18168c68fd"
```

## Fix Option 3: Azure Cloud Shell (requires paid storage account)

1. Go to https://portal.azure.com
2. Click the **Cloud Shell** icon at the top bar: `>_`
3. Run:
```bash
az ad sp create --id d42ffc93-c136-491d-b4fd-6f18168c68fd
```

## What This Does

Creates the **Microsoft Advertising API Service** service principal inside 
your Azure AD tenant. This is a one-time operation. After this, Azure AD 
can resolve the `https://ads.microsoft.com/msads.manage` scope and the 
OAuth flow will work.

## After Creating the Service Principal

1. Go back to your Kaivo app
2. Click the Microsoft "Connect" button again
3. It should redirect to Microsoft sign-in successfully
4. Sign in and authorize the app
5. You'll be redirected back to Kaivo with a success message

## OAuth Flow Summary

```
1. User clicks "Connect Microsoft Ads"
2. Frontend calls GET /platforms/microsoft/oauth/initiate?account_id=X
3. Backend returns oauth_url (login.microsoftonline.com)
4. User signs in and consents on Microsoft
5. Microsoft redirects to {FRONTEND_URL}/integrations/microsoft/oauth/callback?code=...&state=...
6. Frontend callback page sends code+state to backend GET /platforms/microsoft/oauth/callback
7. Backend exchanges code for access_token + refresh_token
8. Tokens stored encrypted in database via PlatformCredentialService
9. User redirected to /campaigns with success message
```
