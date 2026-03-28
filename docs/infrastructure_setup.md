
# Infrastructure Setup Guide

KaivoCore includes Terraform configuration to provision a Kubernetes cluster on **DigitalOcean**. This guide walks you through the process of setting up your Staging environment.

## Prerequisites

1.  **Terraform**: Install Terraform (v1.0+).
    *   Mac (Brew): `brew install terraform`
2.  **DigitalOcean Account**: You need an account and an API Token.
    *   Go to [DigitalOcean Control Panel](https://cloud.digitalocean.com).
    *   Navigate to **API** -> **Generate New Token** (Read/Write scope).

## 1. Provisioning the Cluster

Naviagate to the terraform directory:

```bash
cd infrastructure/terraform
```

Initialize Terraform (downloads plugins):

```bash
terraform init
```

Preview the changes (optional but recommended):

```bash
terraform plan -var="do_token=YOUR_DO_TOKEN_HERE"
```

Apply the configuration to create the cluster (this takes ~5-10 minutes):

```bash
terraform apply -var="do_token=YOUR_DO_TOKEN_HERE"
```
*Type `yes` when prompted.*

## 2. Obtaining the Kubeconfig

Once Terraform completes, it allows you to output the cluster configuration file (`kubeconfig`). KaivoCore's `main.tf` is configured to output this securely.

Run the following command to verify the output and save it:

```bash
terraform output -raw kube_config > ../../staging-kubeconfig.yaml
```

**Verify connectivity:**

```bash
kubectl --kubeconfig=../../staging-kubeconfig.yaml get nodes
```
*You should see a list of 3 nodes.*

## 3. Configuring GitHub Actions

Now that you have the cluster, you need to provide the credentials to GitHub Actions so it can deploy to it.

**Option A: Automatic (CLI)**
If you have the `gh` CLI installed:

## 3. Configure GitHub Actions (Environment Secrets)

To ensure safety and separation between environments, we will use **Environment Secrets** instead of Repository Secrets.

### Step 1: Create the Environment
1.  Go to your GitHub Repository.
2.  Click **Settings** > **Environments**.
3.  Click **New environment**.
4.  Name it: **`staging`**.
5.  Click **Configure environment**.

### Step 2: Add the Secret
1.  Scroll down to **Environment secrets**.
2.  Click **Add secret**.
3.  **Name**: `KUBE_CONFIG`
4.  **Value**: Paste the contents of `staging-kubeconfig.yaml`.
5.  Click **Add secret**.

*(Repeat this process for the `production` environment when you are ready to provision the production cluster).*

### Step 3: Verify
Your `deployment.yml` workflow is already configured to read from the `staging` environment.
On the next push to `main`, the workflow will:
1.  Checkout the code.
2.  Enter the `staging` environment context.
3.  Load the `KUBE_CONFIG` specifically for staging.
4.  Deploy securely.

## 4. Triggering Deployment

Once the secret is set:
1.  Go to the **Actions** tab in GitHub.
2.  Find the defined workflow (or just push a commit to `main`).
3.  The **Deploy to Staging** job will now:
    *   Detect the valid `KUBE_CONFIG`.
    *   Connect to your new DigitalOcean cluster.
    *   Apply the Kubernetes manifests.

## Local Development (Alternative)

If you prefer to test locally without DigitalOcean, you can use **Docker Desktop** or **Minikube**.

1.  Enable Kubernetes in Docker Desktop settings.
2.  Run `kubectl config view --raw > local-kubeconfig.yaml`.
3.  Use this local config for testing scripts, but note that GitHub Actions cannot access your local laptop's cluster directly (unless you use a tunnel, which is not recommended).

---
*Note: Remember to run `terraform destroy -var="do_token=..."` if you want to tear down the cluster to stop billing.*
