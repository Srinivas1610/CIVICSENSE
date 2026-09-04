#!/bin/bash
# ============================================================
# CivicConnect — EC2 Bootstrap Script (K3s + Docker)
# ============================================================
set -e

export DEBIAN_FRONTEND=noninteractive
PROJECT="${project_name}"

echo "==> Updating system..."
apt-get update -y
apt-get upgrade -y

echo "==> Installing dependencies..."
apt-get install -y curl wget git unzip jq

echo "==> Installing Docker..."
curl -fsSL https://get.docker.com | sh
usermod -aG docker ubuntu
systemctl enable docker
systemctl start docker

echo "==> Installing K3s (lightweight Kubernetes)..."
curl -sfL https://get.k3s.io | sh -s - \
  --write-kubeconfig-mode 644 \
  --disable traefik \
  --node-name civicconnect-master

echo "==> Waiting for K3s to be ready..."
sleep 30
until kubectl get nodes | grep -q "Ready"; do sleep 5; done
echo "K3s is ready!"

echo "==> Installing NGINX Ingress Controller..."
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.10.0/deploy/static/provider/cloud/deploy.yaml

echo "==> Setting up kubeconfig for ubuntu user..."
mkdir -p /home/ubuntu/.kube
cp /etc/rancher/k3s/k3s.yaml /home/ubuntu/.kube/config
chown ubuntu:ubuntu /home/ubuntu/.kube/config

echo "==> Bootstrap complete! K3s cluster ready."
echo "==> Run: kubectl get nodes"
