# Infrastructure Provisioning

This directory contains Terraform configuration to provision a Kubernetes cluster on DigitalOcean.

## Prerequisites
- [Terraform](https://www.terraform.io/downloads.html) installed.
- DigitalOcean API Token.

## Usage
1.  Initialize Terraform:
    ```bash
    terraform init
    ```
2.  Plan the deployment:
    ```bash
    terraform plan -var="do_token=YOUR_TOKEN"
    ```
3.  Apply the deployment:
    ```bash
    terraform apply -var="do_token=YOUR_TOKEN"
    ```
4.  Save the Kubeconfig:
    ```bash
    terraform output -raw kube_config > kubeconfig.yaml
    export KUBECONFIG=$(pwd)/kubeconfig.yaml
    ```

## Other Providers
If you are using AWS, GCP, or Azure, please refer to their respective Terraform documentation for `kubernetes_cluster` resources.
