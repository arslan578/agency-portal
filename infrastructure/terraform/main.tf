terraform {
  required_providers {
    digitalocean = {
      source = "digitalocean/digitalocean"
      version = "~> 2.0"
    }
  }
}

provider "digitalocean" {
  token = var.do_token
}

variable "do_token" {}
variable "region" {
  default = "nyc1"
}

resource "digitalocean_kubernetes_cluster" "kaivo" {
  name   = "kaivo-cluster"
  region = var.region
  version = "1.28.2-do.0"

  node_pool {
    name       = "worker-pool"
    size       = "s-2vcpu-4gb"
    node_count = 3
  }
}

output "kube_config" {
  value = digitalocean_kubernetes_cluster.kaivo.kube_config[0].raw_config
  sensitive = true
}

output "cluster_endpoint" {
  value = digitalocean_kubernetes_cluster.kaivo.endpoint
}
